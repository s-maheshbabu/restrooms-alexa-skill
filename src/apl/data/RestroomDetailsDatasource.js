module.exports = (title, restroomLocation, restroomFeatures, additionalInfo) => {
  //TODO: Input validation and testing?
  return {
    bodyTemplate2Data: {
      type: "object",
      objectId: "bt2Sample",
      backgroundImage: {
        contentDescription: null,
        smallSourceUrl: null,
        largeSourceUrl: null,
        sources: [
          {
            url:
              "https://restrooms-alexa-skill.s3.amazonaws.com/refugee-restrooms-background_1.jpg",
            size: "small",
            widthPixels: 0,
            heightPixels: 0
          },
          {
            url:
              "https://restrooms-alexa-skill.s3.amazonaws.com/refugee-restrooms-background_1.jpg",
            size: "large",
            widthPixels: 0,
            heightPixels: 0
          }
        ]
      },
      title: `${title}`,
      image: {
        contentDescription: null,
        smallSourceUrl: null,
        largeSourceUrl: null,
        sources: [
          {
            url:
              "https://restrooms-alexa-skill.s3.amazonaws.com/refugee-restrooms-background_1.jpg",
            size: "small",
            widthPixels: 0,
            heightPixels: 0
          },
          {
            url:
              "https://restrooms-alexa-skill.s3.amazonaws.com/refugee-restrooms-background_1.jpg",
            size: "large",
            widthPixels: 0,
            heightPixels: 0
          }
        ]
      },
      textContent: {
        title: {
          type: "PlainText",
          text: restroomLocation
        },
        primaryText: {
          type: "PlainText",
          text: restroomFeatures
        },
        secondaryText: {
          type: "PlainText",
          text: additionalInfo
        }
      },
      logoUrl:
        "https://restrooms-alexa-skill.s3.amazonaws.com/512x512.png",
      hintText: `Try, "Alexa, ask Refugee Restrooms to find something near me"`
    }
  };
};
