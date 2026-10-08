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
