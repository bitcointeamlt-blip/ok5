// Netlify Function handler - proxies requests to Colyseus Cloud
// This solves CORS issues by running server-side
// Uses native fetch (Node.js 18+ - Netlify uses Node.js 22.21.1)

exports.handler = async (event, context) => {
  // CORS headers visada - leidžiame visus origins
  const headers = {
    'Access-Control-Allow-Origin': event.headers.origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Type',
    'Vary': 'Origin',
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: '',
    };
  }

  try {
    // Get Colyseus Cloud endpoint from environment variable
    // Default: production Colyseus Cloud endpoint
    const colyseusEndpoint = process.env.COLYSEUS_CLOUD_ENDPOINT || 
      'https://de-fra-f8820c12.colyseus.cloud';

    // Extract path from Netlify Function path
    // Event path format: /.netlify/functions/colyseus-proxy/matchmake/joinOrCreate/pvp_room
    // We need: /matchmake/joinOrCreate/pvp_room
    const functionPath = '/.netlify/functions/colyseus-proxy';
    let path = event.path;
    
    if (path.startsWith(functionPath)) {
      path = path.substring(functionPath.length);
    }
    
    // If path is empty, default to root
    if (!path || path === '') {
      path = '/';
    }

    // Build full URL to Colyseus Cloud
    const queryString = event.rawQuery ? `?${event.rawQuery}` : '';
    const url = `${colyseusEndpoint}${path}${queryString}`;

    console.log('🔵 Proxying request:', {
      method: event.httpMethod,
      from: event.path,
      to: url,
      origin: event.headers.origin,
    });

    // Forward request to Colyseus Cloud
    const requestHeaders = {
      'Content-Type': event.headers['content-type'] || 'application/json',
    };

    // Forward authorization header if present
    if (event.headers.authorization) {
      requestHeaders['Authorization'] = event.headers.authorization;
    }

    // Forward request
    const response = await fetch(url, {
      method: event.httpMethod,
      headers: requestHeaders,
      body: event.body || undefined,
    });

    // Get response data
    const data = await response.text();
    const contentType = typeof response.headers.get === 'function'
      ? response.headers.get('content-type') || 'application/json'
      : (response.headers['content-type'] || response.headers['Content-Type'] || 'application/json');

    console.log('✅ Proxy response:', {
      status: response.status,
      contentType,
      dataLength: data.length,
    });

    return {
      statusCode: response.status,
      headers: {
        ...headers,
        'Content-Type': contentType,
      },
      body: data,
    };
  } catch (error) {
    console.error('❌ Proxy error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: error.message,
        details: 'Failed to proxy request to Colyseus Cloud',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }),
    };
  }
};

