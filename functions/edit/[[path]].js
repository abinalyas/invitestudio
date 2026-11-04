// Legacy private links (/edit/<token>) are served the same shell as /edit#<token>.
// Cleanup in cloud-sync.js removes the path token from the address bar.
export { onRequest } from '../edit.js';
