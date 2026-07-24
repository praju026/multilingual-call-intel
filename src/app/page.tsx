'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  FileAudio,
  Play,
  Pause,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Languages,
  Smile,
  Search,
  Filter,
  Sparkles,
  CheckSquare,
  Target,
  FileText,
  HelpCircle,
  HelpCircle as OutcomeIcon
} from 'lucide-react';

import { CallRecord, TranscriptTurn, ActionItem } from '@/lib/db';
import AuthButtons from '@/components/AuthButtons';

export default function Dashboard() {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedUploadLanguage, setSelectedUploadLanguage] = useState('auto');
  const [activeTab, setActiveTab] = useState<'transcript' | 'summary' | 'actionItems' | 'sentiment' | 'outcome'>('transcript');
  
  // Search & Filters
  const [callSearch, setCallSearch] = useState('');
  const [transcriptSearch, setTranscriptSearch] = useState('');
  const [languageFilter, setLanguageFilter] = useState('');
  const [speakerFilter, setSpeakerFilter] = useState('');

  // Audio Playback
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);

  // Poll status interval
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch all calls
  const fetchCalls = async (selectNewIfAny = false) => {
    try {
      const res = await fetch('/api/calls');
      const data = await res.json();
      if (data.success) {
        setCalls(data.calls || []);
        
        // If we want to automatically select the newly uploaded call
        if (selectNewIfAny && data.calls.length > 0) {
          setSelectedCallId(data.calls[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch calls:', err);
    }
  };

  // Fetch single call detail
  const fetchCallDetail = async (id: string) => {
    try {
      const res = await fetch(`/api/calls/${id}`);
      const data = await res.json();
      if (data.success) {
        setSelectedCall(data.call);
      }
    } catch (err) {
      console.error('Failed to fetch call details:', err);
    }
  };

  // Initial load
  useEffect(() => {
    fetchCalls();
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // Fetch detail when selectedCallId changes
  useEffect(() => {
    if (selectedCallId) {
      fetchCallDetail(selectedCallId);
      // Reset audio playback state
      setIsPlaying(false);
      setCurrentTime(0);
      setAudioDuration(0);
      setTranscriptSearch('');
      setSpeakerFilter('');
    } else {
      setSelectedCall(null);
    }
  }, [selectedCallId]);

  // Setup polling if any call is in processing state (queued, transcribing, analyzing)
  useEffect(() => {
    const hasActiveProcessing = calls.some(
      call => ['queued', 'transcribing', 'analyzing'].includes(call.status)
    );

    if (hasActiveProcessing) {
      if (!pollIntervalRef.current) {
        pollIntervalRef.current = setInterval(() => {
          fetchCalls();
          // Also refresh current selected call if it is the one processing
          if (selectedCallId) {
            const currentInList = calls.find(c => c.id === selectedCallId);
            if (currentInList && ['queued', 'transcribing', 'analyzing'].includes(currentInList.status)) {
              fetchCallDetail(selectedCallId);
            }
          }
        }, 3000);
      }
    } else {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }

    return () => {
      if (pollIntervalRef.current && !hasActiveProcessing) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [calls, selectedCallId]);

  // File Upload Handler with validation, drag-and-drop, and automatic Chunked Uploading (> 3.5 MB)
  const ALLOWED_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/m4a', 'audio/x-m4a', 'audio/mp4'];
  const MAX_SIZE_MB = 50;

  const uploadFile = async (file: File) => {
    setUploadError(null);

    // Validate type
    const ext = file.name.split('.').pop()?.toLowerCase();
    const isValidType = ALLOWED_TYPES.includes(file.type) || ['mp3', 'wav', 'm4a'].includes(ext || '');
    if (!isValidType) {
      setUploadError(`Unsupported file type: "${file.type || ext}". Please upload MP3, WAV, or M4A.`);
      return;
    }

    // Validate size
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setUploadError(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is ${MAX_SIZE_MB} MB.`);
      return;
    }

    setUploading(true);
    setUploadProgress(5);

    const CHUNK_SIZE = 3.5 * 1024 * 1024; // 3.5 MB chunks (below Vercel 4.5 MB Serverless limit)
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    try {
      if (totalChunks > 1) {
        const uploadId = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
        let finalCallData = null;

        for (let i = 0; i < totalChunks; i++) {
          const start = i * CHUNK_SIZE;
          const end = Math.min(file.size, start + CHUNK_SIZE);
          const chunkBlob = file.slice(start, end);

          const formData = new FormData();
          formData.append('file', chunkBlob, file.name);
          formData.append('chunkIndex', i.toString());
          formData.append('totalChunks', totalChunks.toString());
          formData.append('uploadId', uploadId);
          formData.append('originalName', file.name);
          formData.append('language', selectedUploadLanguage);

          const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });

          if (!res.ok) {
            const text = await res.text();
            throw new Error(`Chunk ${i + 1}/${totalChunks} upload failed (${res.status}): ${text.slice(0, 100)}`);
          }

          const data = await res.json();
          if (data.call) {
            finalCallData = data;
          }

          setUploadProgress(Math.round(((i + 1) / totalChunks) * 100));
        }

        if (finalCallData?.success) {
          await fetchCalls();
          setSelectedCallId(finalCallData.call.id);
        } else if (finalCallData?.error) {
          setUploadError(`Upload failed: ${finalCallData.error}`);
        }
      } else {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('language', selectedUploadLanguage);

        const progressInterval = setInterval(() => {
          setUploadProgress(prev => (prev >= 85 ? 85 : prev + 10));
        }, 200);

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        clearInterval(progressInterval);
        setUploadProgress(100);

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Upload failed (${res.status}): ${text.slice(0, 100)}`);
        }

        const data = await res.json();
        if (data.success) {
          await fetchCalls();
          setSelectedCallId(data.call.id);
        } else {
          setUploadError(`Upload failed: ${data.error}`);
        }
      }
    } catch (err: any) {
      setUploadError(`Upload failed: ${err.message || 'Network error. Is the server running?'}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
      }, 600);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!uploading) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  // Delete Call Handler
  const handleDeleteCall = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this call record?')) return;

    try {
      const res = await fetch(`/api/calls/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        if (selectedCallId === id) {
          setSelectedCallId(null);
        }
        fetchCalls();
      } else {
        alert(`Failed to delete: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Retry processing
  const handleRetryProcess = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/calls/${id}/process`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        fetchCalls();
        if (selectedCallId === id) {
          fetchCallDetail(id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Helper: parse timestamp like "01:23" or seconds to total seconds
  const parseTimeToSecs = (timeStr: string): number => {
    if (!timeStr) return 0;
    if (!isNaN(Number(timeStr))) return Number(timeStr);
    const parts = timeStr.split(':');
    if (parts.length === 2) {
      return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }
    return 0;
  };

  // Seek audio to segment time
  const handleTimestampClick = (timeStr: string) => {
    if (!audioRef.current) return;
    const secs = parseTimeToSecs(timeStr);
    audioRef.current.currentTime = secs;
    audioRef.current.play();
    setIsPlaying(true);
  };

  // Audio Playback Events
  const handlePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    setCurrentTime(audioRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (!audioRef.current) return;
    setAudioDuration(audioRef.current.duration);
  };

  const handleAudioSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const seekVal = parseFloat(e.target.value);
    audioRef.current.currentTime = seekVal;
    setCurrentTime(seekVal);
  };

  const formatSeconds = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Filtered Calls list
  const filteredCalls = calls.filter(call => {
    const matchesSearch = call.originalName.toLowerCase().includes(callSearch.toLowerCase());
    const matchesLang = languageFilter ? call.insights?.detectedLanguages.some(
      l => l.toLowerCase().includes(languageFilter.toLowerCase())
    ) : true;
    return matchesSearch && matchesLang;
  });

  // Unique languages across all calls
  const allLanguages = Array.from(
    new Set(calls.flatMap(c => c.insights?.detectedLanguages || []))
  );

  // Filter transcript segments
  const filteredTranscript = selectedCall?.transcript?.filter(turn => {
    const matchesSearch = turn.text.toLowerCase().includes(transcriptSearch.toLowerCase());
    const matchesSpeaker = speakerFilter ? turn.speaker === speakerFilter : true;
    return matchesSearch && matchesSpeaker;
  }) || [];

  // Mapped speaker name from insights speakerMapping
  const getSpeakerLabel = (speakerId: string) => {
    if (!selectedCall?.insights?.speakerMapping) return speakerId;
    const mapping = selectedCall.insights.speakerMapping;
    if (speakerId === mapping.agent) {
      return `${speakerId} (Agent)`;
    }
    if (speakerId === mapping.customer) {
      return `${speakerId} (Customer)`;
    }
    return speakerId;
  };

  // Summary Metrics
  const totalCalls = calls.length;
  const completedCalls = calls.filter(c => c.status === 'completed').length;
  const totalDuration = calls.reduce((acc, c) => acc + (c.duration || 0), 0);
  const avgDuration = completedCalls > 0 ? Math.round(totalDuration / completedCalls) : 0;
  
  // Dominant sentiment calculation
  const sentimentCounts = calls.reduce((acc, c) => {
    if (c.insights?.sentiment) {
      const sent = c.insights.sentiment.toLowerCase();
      acc[sent] = (acc[sent] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);
  
  let dominantSentiment = 'N/A';
  let maxCount = 0;
  Object.entries(sentimentCounts).forEach(([sent, count]) => {
    if (count > maxCount) {
      maxCount = count;
      dominantSentiment = sent;
    }
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', padding: '1.5rem' }}>
      {/* Background radial glow */}
      <div className="bg-glow-radial" />

      {/* Main Header */}
      <header style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '2rem',
        borderBottom: '1px solid var(--border-light)',
        paddingBottom: '1rem'
      }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '2.25rem' }}>
            <Sparkles className="spin-slow" style={{ color: 'var(--accent-cyan)' }} />
            <span className="text-gradient-purple">AuraIntel</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', fontSize: '0.95rem' }}>
            Multilingual Call Intelligence Platform & Insight Dashboard
          </p>
        </div>

        {/* Global Key configuration alert & Auth */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div className="badge badge-info" style={{ gap: '0.35rem', padding: '0.5rem 0.75rem' }}>
            <Languages size={14} /> Supported: EN | HI | TE | TA
          </div>
          <AuthButtons />
        </div>
      </header>

      {/* Analytics Summary Cards */}
      <section style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', 
        gap: '1.25rem', 
        marginBottom: '2rem' 
      }}>
        <div className="glass-panel glass-panel-glow-indigo" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(99, 102, 241, 0.15)', borderRadius: '12px', padding: '0.75rem', display: 'flex', color: 'var(--accent-indigo)' }}>
            <FileAudio size={28} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Total Audio Calls</p>
            <h3 style={{ fontSize: '1.75rem', marginTop: '0.2rem' }}>{totalCalls}</h3>
          </div>
        </div>

        <div className="glass-panel glass-panel-glow-cyan" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(6, 182, 212, 0.15)', borderRadius: '12px', padding: '0.75rem', display: 'flex', color: 'var(--accent-cyan)' }}>
            <Clock size={28} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Avg. Call Duration</p>
            <h3 style={{ fontSize: '1.75rem', marginTop: '0.2rem' }}>{formatSeconds(avgDuration)}</h3>
          </div>
        </div>

        <div className="glass-panel glass-panel-glow-indigo" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.15)', borderRadius: '12px', padding: '0.75rem', display: 'flex', color: 'var(--success)' }}>
            <Smile size={28} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Dominant Sentiment</p>
            <h3 style={{ fontSize: '1.75rem', marginTop: '0.2rem', textTransform: 'capitalize' }}>
              {dominantSentiment !== 'N/A' ? dominantSentiment : 'Neutral'}
            </h3>
          </div>
        </div>

        <div className="glass-panel glass-panel-glow-cyan" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(168, 85, 247, 0.15)', borderRadius: '12px', padding: '0.75rem', display: 'flex', color: 'var(--accent-purple)' }}>
            <Languages size={28} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Detected Languages</p>
            <h3 style={{ fontSize: '1.2rem', marginTop: '0.4rem', color: 'var(--accent-cyan)' }}>
              {allLanguages.length > 0 ? allLanguages.slice(0, 3).join(', ').toUpperCase() : 'None'}
            </h3>
          </div>
        </div>
      </section>

      {/* Main Grid: Left sidebar (Calls list & upload) + Right details view */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '320px 1fr', 
        gap: '1.5rem', 
        flex: 1, 
        alignItems: 'stretch' 
      }}>
        {/* Left Side: Call recordings Library */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Audio Upload Box */}
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
              <Upload size={18} style={{ color: 'var(--accent-indigo)' }} /> Upload Recording
            </h4>
            
            {/* Drop Zone */}
            <div
              onClick={() => !uploading && fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragEnter={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              style={{
                border: `2px dashed ${isDragging ? 'var(--accent-cyan)' : uploading ? 'var(--accent-indigo)' : 'var(--border-light)'}`,
                borderRadius: 'var(--radius-md)',
                padding: '1.5rem 1rem',
                textAlign: 'center',
                cursor: uploading ? 'not-allowed' : 'pointer',
                position: 'relative',
                background: isDragging
                  ? 'rgba(6, 182, 212, 0.06)'
                  : uploading
                  ? 'rgba(99, 102, 241, 0.06)'
                  : 'rgba(255, 255, 255, 0.02)',
                transition: 'all 0.2s ease',
                boxShadow: isDragging ? '0 0 20px rgba(6, 182, 212, 0.2)' : 'none',
                userSelect: 'none',
              }}
            >
              {/* Hidden real file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp3,audio/x-m4a,audio/mp4"
                onChange={handleFileInputChange}
                disabled={uploading}
                style={{ display: 'none' }}
              />
              <FileAudio
                size={36}
                style={{
                  color: isDragging ? 'var(--accent-cyan)' : uploading ? 'var(--accent-indigo)' : 'var(--text-secondary)',
                  marginBottom: '0.75rem',
                  transition: 'color 0.2s'
                }}
              />
              <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {isDragging ? 'Drop to Upload!' : uploading ? 'Uploading...' : 'Drag & Drop or Click'}
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                MP3, WAV, or M4A · Max 50 MB
              </p>
            </div>

            {/* Language Selection */}
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Primary Language (Optional)</label>
              <select 
                value={selectedUploadLanguage}
                onChange={(e) => setSelectedUploadLanguage(e.target.value)}
                disabled={uploading}
                className="input-base"
                style={{ cursor: uploading ? 'not-allowed' : 'pointer' }}
              >
                <option value="auto">Auto-Detect (Default)</option>
                <option value="en">English</option>
                <option value="hi">Hindi</option>
                <option value="ta">Tamil</option>
                <option value="te">Telugu</option>
                <option value="ml">Malayalam</option>
                <option value="kn">Kannada</option>
              </select>
            </div>

            {/* Progress Bar */}
            {uploading && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.35rem' }}>
                  <span style={{ color: 'var(--accent-indigo)', fontWeight: 600 }}>Uploading...</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{uploadProgress}%</span>
                </div>
                <div style={{ height: '5px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${uploadProgress}%`,
                    background: 'linear-gradient(90deg, var(--accent-indigo), var(--accent-cyan))',
                    transition: 'width 0.25s ease-in-out',
                    borderRadius: '3px'
                  }} />
                </div>
              </div>
            )}

            {/* Upload Error */}
            {uploadError && !uploading && (
              <div style={{
                marginTop: '0.75rem',
                padding: '0.6rem 0.8rem',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem'
              }}>
                <AlertTriangle size={14} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '1px' }} />
                <p style={{ fontSize: '0.75rem', color: '#f87171', lineHeight: 1.4 }}>{uploadError}</p>
              </div>
            )}
          </div>

          {/* Calls List Container */}
          <div className="glass-panel" style={{ padding: '1.25rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h4 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Recordings Library</h4>
            
            {/* Search Box */}
            <div style={{ position: 'relative', marginBottom: '1rem' }}>
              <input 
                type="text" 
                placeholder="Search recordings..." 
                value={callSearch}
                onChange={e => setCallSearch(e.target.value)}
                className="input-text"
                style={{ width: '100%', paddingLeft: '2.25rem', fontSize: '0.85rem', height: '36px' }}
              />
              <Search size={14} style={{ position: 'absolute', left: '0.8rem', top: '11px', color: 'var(--text-muted)' }} />
            </div>

            {/* List */}
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '500px' }}>
              {filteredCalls.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 1rem', fontSize: '0.85rem' }}>
                  No recordings found.
                </div>
              ) : (
                filteredCalls.map(call => {
                  const isSelected = selectedCallId === call.id;
                  const isProcessing = ['queued', 'transcribing', 'analyzing'].includes(call.status);
                  
                  return (
                    <div 
                      key={call.id}
                      onClick={() => setSelectedCallId(call.id)}
                      style={{
                        padding: '0.85rem',
                        borderRadius: 'var(--radius-md)',
                        background: isSelected ? 'var(--bg-tertiary)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${isSelected ? 'var(--accent-indigo)' : 'var(--border-light)'}`,
                        cursor: 'pointer',
                        transition: 'var(--transition-smooth)',
                        position: 'relative'
                      }}
                      onMouseOver={e => {
                        if (!isSelected) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                      }}
                      onMouseOut={e => {
                        if (!isSelected) e.currentTarget.style.borderColor = 'var(--border-light)';
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <div style={{ overflow: 'hidden', flex: 1 }}>
                          <p style={{ 
                            fontSize: '0.85rem', 
                            fontWeight: 600, 
                            whiteSpace: 'nowrap', 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis',
                            color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)'
                          }}>
                            {call.originalName}
                          </p>
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                            {new Date(call.createdAt).toLocaleDateString()} • {call.duration > 0 ? formatSeconds(call.duration) : '--:--'}
                          </p>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                          <button 
                            onClick={(e) => handleDeleteCall(call.id, e)}
                            style={{ 
                              background: 'transparent', 
                              border: 'none', 
                              color: 'var(--text-muted)', 
                              cursor: 'pointer',
                              padding: '0.2rem',
                              borderRadius: '4px'
                            }}
                            onMouseOver={e => e.currentTarget.style.color = 'var(--danger)'}
                            onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Status row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                        <div>
                          {call.status === 'completed' && (
                            <span className="badge badge-success" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>
                              Completed
                            </span>
                          )}
                          {call.status === 'failed' && (
                            <span className="badge badge-danger" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', cursor: 'help' }} title={call.error}>
                              Failed
                            </span>
                          )}
                          {isProcessing && (
                            <span className="badge badge-warning pulse-glow" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>
                              {call.status}
                            </span>
                          )}
                        </div>

                        {call.status === 'failed' && (
                          <button 
                            onClick={(e) => handleRetryProcess(call.id, e)}
                            style={{ 
                              background: 'rgba(255,255,255,0.05)', 
                              border: '1px solid var(--border-light)', 
                              color: 'var(--text-secondary)',
                              fontSize: '0.65rem',
                              padding: '0.15rem 0.35rem',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.2rem'
                            }}
                          >
                            <RefreshCw size={10} /> Retry
                          </button>
                        )}

                        {call.insights?.detectedLanguages && call.insights.detectedLanguages.length > 0 && (
                          <span style={{ fontSize: '0.65rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>
                            {call.insights.detectedLanguages.join(', ').toUpperCase()}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </aside>

        {/* Right Side: Call details & Intelligence Pane */}
        <main className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
          {!selectedCallId ? (
            <div style={{ 
              flex: 1, 
              display: 'flex', 
              flexDirection: 'column', 
              justifyContent: 'center', 
              alignItems: 'center',
              color: 'var(--text-muted)',
              padding: '3rem'
            }}>
              <FileAudio size={64} style={{ color: 'rgba(255, 255, 255, 0.05)', marginBottom: '1rem', animation: 'float-slow 6s infinite alternate' }} />
              <h3>No Recording Selected</h3>
              <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', textAlign: 'center', maxWidth: '350px' }}>
                Upload an audio file or select an existing recording from the library to view speech-to-text transcripts and AI analysis.
              </p>
            </div>
          ) : !selectedCall ? (
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
              <RefreshCw className="spin-slow" style={{ color: 'var(--accent-indigo)' }} />
              <span>Loading call details...</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1.25rem' }}>
              {/* Header inside Detail View */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'flex-start',
                borderBottom: '1px solid var(--border-light)',
                paddingBottom: '1rem'
              }}>
                <div>
                  <h3 style={{ fontSize: '1.35rem' }}>{selectedCall.originalName}</h3>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Uploaded {new Date(selectedCall.createdAt).toLocaleString()}
                    </span>
                    <span style={{ color: 'var(--border-light)' }}>|</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Duration: {formatSeconds(selectedCall.duration)}
                    </span>
                    
                    {selectedCall.insights?.sentiment && (
                      <>
                        <span style={{ color: 'var(--border-light)' }}>|</span>
                        <span className={`badge ${
                          selectedCall.insights.sentiment.toLowerCase() === 'positive' ? 'badge-success' : 
                          selectedCall.insights.sentiment.toLowerCase() === 'negative' ? 'badge-danger' : 'badge-warning'
                        }`}>
                          Sentiment: {selectedCall.insights.sentiment}
                        </span>
                      </>
                    )}

                    {selectedCall.insights?.callOutcome && (
                      <>
                        <span style={{ color: 'var(--border-light)' }}>|</span>
                        <span className="badge badge-info">
                          Outcome: {selectedCall.insights.callOutcome}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {['queued', 'transcribing', 'analyzing'].includes(selectedCall.status) && (
                    <div className="badge badge-warning pulse-glow" style={{ gap: '0.3rem' }}>
                      <RefreshCw size={12} className="spin-slow" /> Processing: {selectedCall.status}
                    </div>
                  )}
                  {selectedCall.status === 'failed' && (
                    <div className="badge badge-danger" style={{ gap: '0.3rem' }}>
                      <AlertTriangle size={12} /> Failed: {selectedCall.error || 'STT Error'}
                    </div>
                  )}
                  {selectedCall.status === 'completed' && (
                    <div className="badge badge-success" style={{ gap: '0.3rem' }}>
                      <CheckCircle2 size={12} /> AI Analyzed
                    </div>
                  )}
                </div>
              </div>

              {/* Status Specific Render */}
              {['queued', 'transcribing', 'analyzing'].includes(selectedCall.status) ? (
                <div style={{ 
                  flex: 1, 
                  display: 'flex', 
                  flexDirection: 'column', 
                  justifyContent: 'center', 
                  alignItems: 'center',
                  padding: '4rem 2rem'
                }}>
                  <div style={{ position: 'relative', width: '80px', height: '80px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div className="pulse-glow" style={{ 
                      position: 'absolute', 
                      width: '100%', 
                      height: '100%', 
                      borderRadius: '50%', 
                      background: 'rgba(99, 102, 241, 0.1)' 
                    }} />
                    <RefreshCw size={36} className="spin-slow" style={{ color: 'var(--accent-indigo)' }} />
                  </div>
                  <h4 style={{ marginTop: '1.5rem', textTransform: 'capitalize' }}>Status: {selectedCall.status}</h4>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.5rem', textAlign: 'center', maxWidth: '350px' }}>
                    {selectedCall.status === 'queued' && 'Waiting for background worker to pickup the audio file...'}
                    {selectedCall.status === 'transcribing' && 'Transcribing multilingual audio turns, detecting speakers & speaker turns...'}
                    {selectedCall.status === 'analyzing' && 'Generating AI insights (summary, sentiment, action items, outcomes) using Gemini...'}
                  </p>
                </div>
              ) : selectedCall.status === 'failed' ? (
                <div style={{ 
                  flex: 1, 
                  display: 'flex', 
                  flexDirection: 'column', 
                  justifyContent: 'center', 
                  alignItems: 'center',
                  padding: '4rem 2rem',
                  color: 'var(--danger)'
                }}>
                  <AlertTriangle size={48} />
                  <h4 style={{ marginTop: '1rem' }}>Processing Failed</h4>
                  <pre style={{ 
                    marginTop: '0.5rem', 
                    fontSize: '0.8rem', 
                    background: 'rgba(239, 68, 68, 0.05)', 
                    padding: '1rem', 
                    borderRadius: '8px', 
                    border: '1px solid rgba(239,68,68,0.2)',
                    whiteSpace: 'pre-wrap',
                    maxWidth: '80%',
                    textAlign: 'center',
                    color: 'var(--text-primary)',
                    fontFamily: 'monospace'
                  }}>
                    {selectedCall.error || 'An error occurred during audio file processing.'}
                  </pre>
                  <button 
                    onClick={(e) => handleRetryProcess(selectedCall.id, e)}
                    className="btn-primary" 
                    style={{ marginTop: '1.5rem' }}
                  >
                    <RefreshCw size={16} /> Retry Analysis Pipeline
                  </button>
                </div>
              ) : (
                <>
                  {/* Web Audio Player Player controls */}
                  <div style={{ 
                    background: 'var(--bg-secondary)', 
                    border: '1px solid var(--border-light)', 
                    borderRadius: 'var(--radius-md)', 
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem'
                  }}>
                    {/* Hidden Native Audio Element */}
                    <audio 
                      ref={audioRef}
                      src={`/api/audio/${selectedCall.filename}`}
                      onTimeUpdate={handleTimeUpdate}
                      onLoadedMetadata={handleLoadedMetadata}
                      onEnded={() => setIsPlaying(false)}
                    />

                    {/* Progress Slider */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-secondary)', minWidth: '38px' }}>
                        {formatSeconds(currentTime)}
                      </span>
                      <input 
                        type="range" 
                        min="0"
                        max={audioDuration || 1}
                        value={currentTime}
                        onChange={handleAudioSeek}
                        style={{ 
                          flex: 1, 
                          height: '4px', 
                          background: 'var(--bg-tertiary)',
                          borderRadius: '2px',
                          outline: 'none',
                          cursor: 'pointer',
                          accentColor: 'var(--accent-cyan)'
                        }} 
                      />
                      <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-secondary)', minWidth: '38px' }}>
                        {formatSeconds(audioDuration)}
                      </span>
                    </div>

                    {/* Play/Pause control */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <button 
                        onClick={handlePlayPause}
                        style={{ 
                          width: '40px', 
                          height: '40px', 
                          borderRadius: '50%', 
                          border: 'none',
                          background: 'linear-gradient(135deg, var(--accent-cyan) 0%, var(--accent-indigo) 100%)',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          boxShadow: '0 4px 10px rgba(6, 182, 212, 0.3)',
                          transition: 'var(--transition-smooth)'
                        }}
                        onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
                        onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                      >
                        {isPlaying ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: '2px' }} />}
                      </button>
                    </div>
                  </div>

                  {/* Tabs Selector */}
                  <div style={{ 
                    display: 'flex', 
                    borderBottom: '1px solid var(--border-light)', 
                    gap: '1rem',
                    background: 'rgba(255, 255, 255, 0.01)',
                    padding: '0.25rem 0.25rem 0 0.25rem',
                    borderRadius: 'var(--radius-sm)'
                  }}>
                    {(['transcript', 'summary', 'actionItems', 'sentiment', 'outcome'] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          borderBottom: `2px solid ${activeTab === tab ? 'var(--accent-indigo)' : 'transparent'}`,
                          color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
                          padding: '0.75rem 0.5rem',
                          fontSize: '0.85rem',
                          fontWeight: activeTab === tab ? 600 : 500,
                          cursor: 'pointer',
                          transition: 'var(--transition-fast)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          textTransform: 'capitalize'
                        }}
                      >
                        {tab === 'transcript' && <FileText size={14} />}
                        {tab === 'summary' && <Sparkles size={14} />}
                        {tab === 'actionItems' && <CheckSquare size={14} />}
                        {tab === 'sentiment' && <Target size={14} />}
                        {tab === 'outcome' && <OutcomeIcon size={14} />}
                        {tab === 'actionItems' ? 'Action Items' : tab}
                      </button>
                    ))}
                  </div>

                  {/* Tab Contents */}
                  <div style={{ flex: 1, overflowY: 'auto', maxHeight: '420px', paddingRight: '0.5rem' }}>
                    
                    {/* TRANSCRIPT TAB */}
                    {activeTab === 'transcript' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {/* Transcript Filters */}
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                          <div style={{ position: 'relative', flex: 1 }}>
                            <input 
                              type="text" 
                              placeholder="Search transcript..." 
                              value={transcriptSearch}
                              onChange={e => setTranscriptSearch(e.target.value)}
                              className="input-text"
                              style={{ width: '100%', paddingLeft: '2.25rem', fontSize: '0.85rem', height: '34px' }}
                            />
                            <Search size={12} style={{ position: 'absolute', left: '0.8rem', top: '11px', color: 'var(--text-muted)' }} />
                          </div>

                          <div style={{ position: 'relative', width: '150px' }}>
                            <select
                              value={speakerFilter}
                              onChange={e => setSpeakerFilter(e.target.value)}
                              className="input-text"
                              style={{ 
                                width: '100%', 
                                fontSize: '0.85rem', 
                                height: '34px', 
                                padding: '0.25rem 0.5rem', 
                                appearance: 'none',
                                cursor: 'pointer'
                              }}
                            >
                              <option value="">All Speakers</option>
                              {Array.from(new Set(selectedCall.transcript?.map(t => t.speaker) || [])).map(sp => (
                                <option key={sp} value={sp}>{getSpeakerLabel(sp)}</option>
                              ))}
                            </select>
                            <Filter size={12} style={{ position: 'absolute', right: '0.8rem', top: '11px', pointerEvents: 'none', color: 'var(--text-muted)' }} />
                          </div>
                        </div>

                        {/* Transcript turns */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          {filteredTranscript.length === 0 ? (
                            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                              No matching transcript segments found.
                            </div>
                          ) : (
                            filteredTranscript.map((turn, idx) => {
                              const startSec = parseTimeToSecs(turn.startTime);
                              const endSec = parseTimeToSecs(turn.endTime);
                              
                              // Check if active during playback
                              const isActive = currentTime >= startSec && currentTime <= endSec;
                              const isAgent = selectedCall.insights?.speakerMapping ? 
                                turn.speaker === selectedCall.insights.speakerMapping.agent :
                                turn.speaker.toLowerCase().includes('agent') || turn.speaker.endsWith('A');

                              return (
                                <div 
                                  key={idx}
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.25rem',
                                    padding: '0.75rem 1rem',
                                    borderRadius: 'var(--radius-md)',
                                    background: isActive ? 'rgba(99, 102, 241, 0.08)' : 'rgba(255, 255, 255, 0.01)',
                                    borderLeft: `3px solid ${
                                      isActive ? 'var(--accent-cyan)' : 
                                      isAgent ? 'var(--accent-indigo)' : 'var(--accent-cyan)'
                                    }`,
                                    transition: 'var(--transition-fast)'
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ 
                                      fontSize: '0.8rem', 
                                      fontWeight: 700, 
                                      color: isAgent ? 'var(--accent-indigo)' : 'var(--accent-cyan)' 
                                    }}>
                                      {getSpeakerLabel(turn.speaker)}
                                    </span>
                                    
                                    <button 
                                      onClick={() => handleTimestampClick(turn.startTime)}
                                      style={{
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid var(--border-light)',
                                        color: 'var(--text-secondary)',
                                        fontFamily: 'monospace',
                                        fontSize: '0.75rem',
                                        padding: '0.15rem 0.4rem',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.25rem'
                                      }}
                                    >
                                      <Play size={8} /> {turn.startTime}
                                    </button>
                                  </div>
                                  <p style={{ 
                                    fontSize: '0.9rem', 
                                    lineHeight: '1.5',
                                    color: isActive ? 'var(--text-primary)' : 'rgba(248, 250, 252, 0.95)'
                                  }}>
                                    {turn.text}
                                  </p>
                                  
                                  {turn.language && (
                                    <span style={{ 
                                      fontSize: '0.65rem', 
                                      color: 'var(--text-muted)', 
                                      alignSelf: 'flex-end',
                                      textTransform: 'uppercase',
                                      fontWeight: 600
                                    }}>
                                      {turn.language}
                                    </span>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}

                    {/* AI SUMMARY TAB */}
                    {activeTab === 'summary' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        <div className="glass-panel" style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.01)' }}>
                          <h4 style={{ color: 'var(--accent-indigo)', marginBottom: '0.5rem', fontSize: '1rem' }}>Executive Summary</h4>
                          <p style={{ fontSize: '0.95rem', lineHeight: '1.6', color: 'rgba(248,250,252,0.9)' }}>
                            {selectedCall.insights?.summary || 'No summary generated.'}
                          </p>
                        </div>

                        <div className="glass-panel" style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.01)' }}>
                          <h4 style={{ color: 'var(--accent-cyan)', marginBottom: '0.75rem', fontSize: '1rem' }}>Key Discussion Points</h4>
                          <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', paddingLeft: '1.25rem' }}>
                            {selectedCall.insights?.keyDiscussionPoints?.map((pt, idx) => (
                              <li key={idx} style={{ fontSize: '0.9rem', lineHeight: '1.5', color: 'rgba(248,250,252,0.9)' }}>
                                {pt}
                              </li>
                            )) || <li>No points extracted.</li>}
                          </ul>
                        </div>
                      </div>
                    )}

                    {/* ACTION ITEMS TAB */}
                    {activeTab === 'actionItems' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <h4 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>Identified Action Items</h4>
                        {selectedCall.insights?.actionItems && selectedCall.insights.actionItems.length > 0 ? (
                          selectedCall.insights.actionItems.map((item, idx) => (
                            <div 
                              key={idx}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '0.85rem 1rem',
                                borderRadius: 'var(--radius-md)',
                                background: 'rgba(255,255,255,0.02)',
                                border: '1px solid var(--border-light)',
                                gap: '1rem'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                                <div style={{ 
                                  marginTop: '0.15rem', 
                                  color: item.urgency === 'high' ? 'var(--danger)' : item.urgency === 'medium' ? 'var(--warning)' : 'var(--accent-cyan)'
                                }}>
                                  <CheckSquare size={16} />
                                </div>
                                <div>
                                  <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                                    {item.task}
                                  </p>
                                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                    Assignee: <strong style={{ color: 'var(--text-secondary)' }}>{item.assignee}</strong>
                                  </p>
                                </div>
                              </div>

                              <span className={`badge ${
                                item.urgency === 'high' ? 'badge-danger' : 
                                item.urgency === 'medium' ? 'badge-warning' : 'badge-success'
                              }`} style={{ fontSize: '0.65rem', flexShrink: 0 }}>
                                {item.urgency} Priority
                              </span>
                            </div>
                          ))
                        ) : (
                          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                            No action items extracted from this call.
                          </div>
                        )}
                      </div>
                    )}

                    {/* SENTIMENT & INTENT TAB */}
                    {activeTab === 'sentiment' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                          
                          {/* Sentiment */}
                          <div className="glass-panel" style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.01)' }}>
                            <h4 style={{ color: 'var(--accent-indigo)', marginBottom: '0.5rem', fontSize: '1rem' }}>Overall Sentiment</h4>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.75rem' }}>
                              <span className={`badge ${
                                selectedCall.insights?.sentiment?.toLowerCase() === 'positive' ? 'badge-success' : 
                                selectedCall.insights?.sentiment?.toLowerCase() === 'negative' ? 'badge-danger' : 'badge-warning'
                              }`} style={{ fontSize: '1rem', padding: '0.4rem 0.8rem' }}>
                                {selectedCall.insights?.sentiment || 'Neutral'}
                              </span>
                            </div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.75rem', lineHeight: '1.4' }}>
                              Sentiment analysis is calculated based on vocabulary, language tones, and code-switched conversational dynamics during speaker turns.
                            </p>
                          </div>

                          {/* Customer Intent */}
                          <div className="glass-panel" style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.01)' }}>
                            <h4 style={{ color: 'var(--accent-cyan)', marginBottom: '0.5rem', fontSize: '1rem' }}>Customer Intent</h4>
                            <div style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '0.5rem', 
                              padding: '0.4rem 0.8rem', 
                              borderRadius: 'var(--radius-sm)', 
                              background: 'rgba(6, 182, 212, 0.1)', 
                              color: 'var(--accent-cyan)',
                              fontSize: '0.95rem',
                              fontWeight: 600,
                              marginTop: '0.75rem',
                              border: '1px solid rgba(6,182,212,0.2)'
                            }}>
                              <Target size={14} /> {selectedCall.insights?.customerIntent || 'Information Seeking'}
                            </div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.75rem', lineHeight: '1.4' }}>
                              Indicates the core objective or issue the caller wanted to address.
                            </p>
                          </div>

                        </div>
                      </div>
                    )}

                    {/* CALL OUTCOME TAB */}
                    {activeTab === 'outcome' && (
                      <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', background: 'rgba(255,255,255,0.01)' }}>
                        <div style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent-indigo)', borderRadius: '50%', width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center' }}>
                          <Target size={28} />
                        </div>
                        <h4 style={{ fontSize: '1.15rem' }}>Call Outcome Classification</h4>
                        <div style={{ 
                          fontSize: '1.25rem', 
                          fontWeight: 700, 
                          color: 'var(--accent-cyan)', 
                          background: 'rgba(255,255,255,0.03)', 
                          padding: '0.75rem 2rem', 
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-light)',
                          marginTop: '0.5rem',
                          display: 'inline-block'
                        }}>
                          {selectedCall.insights?.callOutcome || 'Unclassified'}
                        </div>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', maxWidth: '400px', lineHeight: '1.5', marginTop: '0.5rem' }}>
                          This outcome is automatically classified by analyze models assessing final speaker agreements, tasks resolved, or commitments scheduled.
                        </p>
                      </div>
                    )}

                  </div>
                </>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
