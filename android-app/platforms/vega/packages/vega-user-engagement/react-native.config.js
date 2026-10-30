module.exports = {
  dependency: {
    platforms: {
      kepler: {
        autolink: {
          TvAppVlcView: {
            uiComponentName: '/com.tvapp.vlcview',
            linkDynamic: true,
            provider: 'application',
            components: ['TvAppVlcView'],
            turbomodules: [],
          },
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
