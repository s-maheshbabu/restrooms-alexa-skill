const { Map } = require('immutable');

let map;

module.exports.init = () => {
    return new Promise((resolve, reject) => {
        if (!map) {
            console.log("Zipcode to Lat/Lon database being loaded.");
            const data = require('./us-zip-code-latitude-and-longitude.json');

            const internalMap = Map();
            map = internalMap.withMutations(internalMap => {
                data.forEach(datum => {
                    internalMap.set(datum.zip, datum);
                });
            });
            resolve();
        } else {
            resolve();
        }
    });
};

/**
 * Doc
 */
module.exports.getCoordinates = zipCode => {
    const address = map.get(zipCode);
    return { latitude: address.latitude, longitude: address.longitude };
};
