const SanitizeService = module.exports;
module.exports.removeScriptTags = function(input) {
    // Regular expression to match script tags
    const scriptRegex = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
  
    // Remove script tags from the input using replace
    return input.replace(scriptRegex, '');
  }
