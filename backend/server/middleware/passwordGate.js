// server/middleware/passwordGate.js
export function passwordGate({ cookieName }) {
  return function gate(req, res, next) {
    if (req.method === "OPTIONS") return next();
    if (req.path === "/login" || req.path === "/logout") return next();
    if (req.signedCookies?.[cookieName] === "ok") return next();
    if (req.accepts("html")) return res.redirect(302, "/login");
    return res.status(401).send("Password required.");
  };
}
