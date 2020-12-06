module.exports = (title, restrooms) => {

  return {
    searchResults: {
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
      restrooms: restrooms,
      logoUrl:
        "https://restrooms-alexa-skill.s3.amazonaws.com/512x512.png",
      hintText: `Try swiping sideways for more restrooms"`
    }
  };
};
