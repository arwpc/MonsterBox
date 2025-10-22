/**
 * ESLint Custom Rule: no-legacy-calibration
 * Bans identifiers containing legacy calibration patterns
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow legacy calibration identifiers',
      category: 'Best Practices',
      recommended: true
    },
    messages: {
      legacyIdentifier: 'Legacy calibration identifier "{{name}}" is banned. Use Unified Positions v1.5 instead.'
    },
    schema: []
  },

  create(context) {
    const BANNED_PATTERNS = [
      /legacyCal/i,
      /SimpleCalibration/i,
      /speedForTime/i,
      /moveForMs/i,
      /lockMinMax/i,
      /setMinLegacy/i,
      /setMaxLegacy/i,
      /simpleCalibration(?!Service\.js)/i // Allow the service file itself during migration
    ];

    function checkIdentifier(node) {
      const name = node.name;

      for (const pattern of BANNED_PATTERNS) {
        if (pattern.test(name)) {
          context.report({
            node,
            messageId: 'legacyIdentifier',
            data: { name }
          });
        }
      }
    }

    return {
      Identifier(node) {
        // Skip if this is a property key in an object (to avoid false positives)
        if (node.parent.type === 'Property' && node.parent.key === node) {
          return;
        }
        checkIdentifier(node);
      }
    };
  }
};
