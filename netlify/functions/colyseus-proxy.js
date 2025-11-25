// Netlify Function handler - proxies requests to Colyseus Cloud
// This solves CORS issues by running server-side

// Use native fetch (Node.js 18+) or require node-fetch for older versions
let fetch;
try {
  // Try native fetch first (Node.js 18+)
  if (typeof globalThis.fetch === 'function') {
    fetch = globalThis.fetch;
  } else {
    // Fallback to node-fetch if available
    fetch = require('node-fetch');
  }
} catch (e) {
  // If node-fetch not available, use https module
  const https = require('https');
  const http = require('http');
  const { URL } = require('url');
  
  fetch = (url, options = {}) => {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const client = urlObj.protocol === 'https:' ? https : http;
      
      const req = client.request({
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        headers: options.headers || {},
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            statusText: res.statusMessage,
            headers: res.headers,
            text: () => Promise.resolve(data),
            json: () => Promise.resolve(JSON.parse(data)),
          });
        });
      });
      
      req.on('error', reject);
      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  };
}

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

