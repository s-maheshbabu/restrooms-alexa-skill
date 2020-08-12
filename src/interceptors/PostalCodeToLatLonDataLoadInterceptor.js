const postalCodeToLatLon = require("gateway/postalCodeToLatLon");

module.exports = PostalCodeToLatLonDataLoadInterceptor = {
  process(handlerInput) {
    return postalCodeToLatLon.init();
  }
};
