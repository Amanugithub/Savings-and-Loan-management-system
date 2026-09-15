export const CHAIR_LEVEL = [
  'chairperson',
  'vice_chairperson',
];

export const INTAKE_LEVEL = [
  'cashier',
  'general_manager',
];

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.admin?.role)) {
      return res.status(403).json({
        error: 'FORBIDDEN_ROLE',
        message: 'You do not have permission to perform this action',
      });
    }

    next();
  };
}
