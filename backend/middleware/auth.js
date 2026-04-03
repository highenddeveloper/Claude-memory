import crypto from 'crypto';
import config from '../config.js';

// Docker bridge network CIDR: 172.16.0.0/12
const DOCKER_CIDRS = [
  { prefix: '172.', min: 16, max: 31 }, // 172.16.x.x - 172.31.x.x
];

function isDockerInternal(ip) {
  if (!ip) return false;
  // Normalize IPv6-mapped IPv4
  const addr = ip.replace(/^::ffff:/, '');
  if (addr === '127.0.0.1') return true;
  for (const cidr of DOCKER_CIDRS) {
    if (addr.startsWith(cidr.prefix)) {
      const second = parseInt(addr.split('.')[1], 10);
      if (second >= cidr.min && second <= cidr.max) return true;
    }
  }
  return false;
}

function timingSafeEqual(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Compare against self to keep constant time
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function authMiddleware(req, res, next) {
  // Skip auth in development when no key is configured
  if (config.nodeEnv === 'development' && !config.apiKey) {
    return next();
  }

  // Skip auth for verified Docker internal network
  const remoteAddr = req.ip || req.connection?.remoteAddress;
  if (isDockerInternal(remoteAddr)) {
    return next();
  }

  const apiKey = req.headers['x-api-key'];
  if (!timingSafeEqual(apiKey, config.apiKey)) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or missing API key',
    });
  }

  next();
}
