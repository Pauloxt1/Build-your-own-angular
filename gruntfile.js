'use strict';

module.exports = (grunt) => {

  grunt.initConfig({
      jshint:{
        all: ['src/**/*.js', 'test/**/*.js'],
        options:{
          globals:{
            _:false,
            $: false,
            jasmine: false,
            describe: false,
            it: false,
            expect: false,
            beforeEach: false,
            afterEach: false,
            sinon: false
          },
          browser:true,
          devel:true
        }
      }
  });

  grunt.registerTask('default', 'jshint');

  grunt.loadNpmTasks('grunt-contrib-jshint');
}
