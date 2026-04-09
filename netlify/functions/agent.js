// Netlify Function: Claude AI agent proxy for lenta game
// API key stored server-side — never exposed to browser

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: 'Method Not Allowed' };
  }

  const key = process.env.ANTHROPIC_KEY;
  if (!key) {
    return {
      statusCode: 503,
      headers: corsHeaders(),
      body: JSON.stringify({ error: { message: 'Agent not configured on server.' } })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: { message: 'Invalid JSON' } }) };
  }

  // Safety: only allow haiku model and small token budgets
  body.model = 'claude-haiku-4-5-20251001';
  body.max_tokens = Math.min(body.max_tokens || 128, 256);

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body)
    });

    const data = await resp.text();
    return {
      statusCode: resp.status,
      headers: { ...corsHeaders(), 'content-type': 'application/json' },
      body: data
    };
  } catch (e) {
    return {
      statusCode: 502,
      headers: corsHeaders(),
      body: JSON.stringify({ error: { message: e.message } })
    };
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
