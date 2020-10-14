'use strict';

// Indicates addresses like 'two one forty eighth avenue' that can be parsed in
// multiple ways and hence effectively unparseable.
module.exports = function UnparseableError(message) {
    Error.captureStackTrace(this, this.constructor);
    this.name = this.constructor.name;
    this.message = message;
};

require('util').inherits(module.exports, Error);