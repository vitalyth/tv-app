module.exports = {
  dependency: {
    platforms: {
      kepler: {
        autolink: {
          TvAppUserEngagement: {
            libraryName: 'libTvAppUserEngagement.so',
            linkDynamic: true,
            provider: 'application',
            components: [],
            turbomodules: ['TvAppUserEngagement'],
          },
        },
      },
    },
  },
};
