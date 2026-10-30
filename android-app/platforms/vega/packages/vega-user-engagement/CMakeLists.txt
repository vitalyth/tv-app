cmake_minimum_required(VERSION 3.22)

project(TvAppUserEngagement
        VERSION 1.0
        LANGUAGES CXX C)

set(CMAKE_MODULE_PATH ${CMAKE_BINARY_DIR} ${CMAKE_MODULE_PATH})
set(CMAKE_PREFIX_PATH ${CMAKE_BINARY_DIR} ${CMAKE_PREFIX_PATH})

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

set(HEADERS
  kepler/turbo-modules/TvAppUserEngagement.h
)

set(SOURCES
  kepler/turbo-modules/TvAppUserEngagement.cpp
  kepler/AutoLinkInit.cpp
)

find_package(Apmf REQUIRED)
find_package(Kepler REQUIRED)
find_package(turbomoduleAPI CONFIG REQUIRED)

kepler_add_idl_import_library(user_engagement_idl
  PACKAGES
    com.amazon.kepler.user_engagement
)

kepler_add_turbo_module_library(TvAppUserEngagement SHARED ${HEADERS} ${SOURCES})

target_link_libraries(TvAppUserEngagement PRIVATE user_engagement_idl)

install(TARGETS TvAppUserEngagement)

# The multiview renderer is an independent component, not part of engagement.
kepler_add_idl_import_library(vlc_view_idl
  PACKAGES
    com.amazon.kepler.graphics
    com.amazon.kepler.uitoolkit.graphics
    com.amazon.kepler.uitoolkit.view
    com.amazon.kepler.uitoolkit.react
)

set(VLC_BUNDLE ${CMAKE_CURRENT_SOURCE_DIR}/build/vlc/${CMAKE_SYSTEM_PROCESSOR})
set(VLC_RENDERER_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../../../scripts/native)
kepler_add_library(TvAppVlcView SHARED kepler/vlc/TvAppVlcView.cpp)
set_target_properties(TvAppVlcView PROPERTIES PREFIX "" OUTPUT_NAME "com.tvapp.vlcview")
target_link_libraries(TvAppVlcView PRIVATE vlc_view_idl)
if(CMAKE_SYSTEM_PROCESSOR MATCHES "^(armv7|x86_64)$" AND EXISTS "${VLC_BUNDLE}/lib/libvlc.so")
  target_compile_definitions(TvAppVlcView PRIVATE TVAPP_VLC_AVAILABLE=1)
  target_compile_definitions(TvAppUserEngagement PRIVATE TVAPP_VLC_AVAILABLE=1)
  target_sources(TvAppVlcView PRIVATE ${VLC_RENDERER_DIR}/vega-yuv-renderer.c)
  target_include_directories(TvAppVlcView PRIVATE ${VLC_BUNDLE}/include ${VLC_RENDERER_DIR})
  target_link_libraries(TvAppVlcView PRIVATE ${VLC_BUNDLE}/lib/libvlc.so dl)
  set_target_properties(TvAppVlcView PROPERTIES INSTALL_RPATH "$ORIGIN")
  target_link_options(TvAppVlcView PRIVATE -Wl,--disable-new-dtags)
  # Vega's app autolinker discovers *.so and flattens the module's lib tree.
  install(FILES ${VLC_BUNDLE}/lib/libvlc.so ${VLC_BUNDLE}/lib/libvlccore.so DESTINATION lib)
  install(DIRECTORY ${VLC_BUNDLE}/lib/plugins/ DESTINATION lib)
  install(DIRECTORY ${VLC_BUNDLE}/licenses/ DESTINATION share/tvapp-vlc/licenses)
else()
  target_compile_definitions(TvAppVlcView PRIVATE TVAPP_VLC_AVAILABLE=0)
  target_compile_definitions(TvAppUserEngagement PRIVATE TVAPP_VLC_AVAILABLE=0)
endif()
# The React Native UI autolinker registers the component; avoid duplicate aliases.
install(TARGETS TvAppVlcView)
