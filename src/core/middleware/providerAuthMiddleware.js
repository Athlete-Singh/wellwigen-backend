import jwt from "jsonwebtoken";
import Provider from "../../features/provider/provider.model.js";

/**
 * Middleware ensuring the request is authenticated by a valid Provider session/token.
 * Attaches the authenticated Provider document to req.provider.
 */
export const providerAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Missing authorization header",
      });
    }

    const token = authHeader.split(" ")[1];
    const secret = process.env.JWT_SECRET || "fallback_secret";

    let decoded;
    try {
      decoded = jwt.verify(token, secret);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Invalid or expired token",
      });
    }

    if (!decoded || !decoded.id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Invalid token payload",
      });
    }

    const provider = await Provider.findById(decoded.id);
    if (!provider) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Provider account not found",
      });
    }

    req.provider = provider;
    req.user = decoded;
    next();
  } catch (err) {
    console.error("Provider Auth Middleware Error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error during authentication",
    });
  }
};

export default providerAuthMiddleware;
