require('dotenv').config({path: '.env.local'});
import('@vercel/postgres').then(async ({sql}) => {
  try {
    const {rows} = await sql`SELECT id, data->>'status' as status FROM calls WHERE data->>'status' = 'transcribing'`;
    console.log("Stuck calls:", rows);
  } catch (err) {
    console.error(err);
  }
}).catch(console.error);
