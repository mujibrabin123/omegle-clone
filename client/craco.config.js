// craco.config.js
module.exports = {
    webpack: {
      configure: (webpackConfig) => {
        webpackConfig.resolve.fallback = {
          ...webpackConfig.resolve.fallback,
          process: require.resolve("process/browser"),
        };
        return webpackConfig;
      },
    },
  };
  