import rateLimit from 'express-rate-limit';

// Docker bridge network CIDR: 172.16.0.0/12
function isDockerInternal(ip) {
  if (!ip) return false;
  const addr = ip.replace(/^::ffff:/, '');
  if (addr === '127.0.0.1' || addr === '::1') return true;
  if (addr.startsWith('172.')) {
    const second = parseInt(addr.split('.')[1], 10);
    return second >= 16 && second <= 31;
  }
  return false;
}

export function createRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100,            // 100 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      const ip = req.ip || req.connection?.remoteAddress;
      return isDockerInternal(ip);
    },
    message: {
      success: false,
      error: 'Too many requests, please try again later',
    },
  });
}
