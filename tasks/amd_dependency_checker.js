/*
 * grunt-amd-dependency-checker
 * https://github.com/mehdishojaei/grunt-amd-dependency-checker
 *
 * Copyright (c) 2013 Mehdi Shojaei
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function(grunt) {

  // Please see the Grunt documentation for more information regarding task
  // creation: http://gruntjs.com/creating-tasks
  var options = {};

  var getModuleBody = function (text) {
    for (var i = 0, counter = 0, len = text.length; i < len; ++i) {
      if (text[i] === '{') {
        ++counter;
      } else if (text[i] === '}') {
        --counter;
      }

      if (!counter) {
        break;
      }
    }

    return text.substring(1, i);
  },

  removeComments = function (text) {
    var comments = [];
    text = text.replace(/(?:\/\*[^]*?\*\/)|(?:\/\/[^]*?$)/gm, function (match) {
      comments.push(match);
      return '';
    });

    return { source: text, comments: comments };
  },

  findUseage = function (variable, text) {
    variable = variable.replace('$', '\\$');

    var validChars = '(?:[^A-Za-z0-9_\\$"\']|^|$)',
      pattern = validChars + variable + validChars,
      regExp = new RegExp(pattern);

    return !!regExp.exec(text);
  },

  processFile = function (filepath) {
    var results = [],
        content = grunt.file.read(filepath);

    var output = content.replace(
      /define\s*\(\s*(?:['"](.*)['"]\s*,\s*)?(?:\[\s*([^]*?)\s*\]\s*,)?\s*function\s*\(\s*([^]*?)\s*\)\s*\{/gm,
      function (match, moduleId, pathsStr, dependenciesStr, offset) {
      var text = content.substr(offset + match.length - 1), // Unprocessed
          paths,
          dependencies,
          unusedDependencies = [],
          unusedPaths = [],
          body, // Module body with comments
          source, // Module body without comments
          comments; // Array of inline and block comments

      paths = pathsStr ? pathsStr.split(/\s*,\s*/) : [];
      dependencies = dependenciesStr ? dependenciesStr.split(/\s*,\s*/) : [];

      if (paths && dependencies && text) {
        body = getModuleBody(text);

        if (body) {
          var rcResult = removeComments(body);

          if (rcResult) {
            source = rcResult.source;
            comments = rcResult.comments;

            unusedDependencies = dependencies.filter(function (dependency) {
              return options.excepts.indexOf(dependency) < 0 && !findUseage(dependency, source);
            });

            unusedPaths = unusedDependencies.map(function (dependency) {
              return paths[dependencies.indexOf(dependency)];
            });

            results.push({
              moduleId: moduleId,
              paths: paths,
              dependencies: dependencies,
              unusedPaths: unusedPaths,
              unusedDependencies: unusedDependencies,
              bodyWithComments: body,
              bodyWithoutComments: source,
              comments: comments
            });
          }
        }
      }

      if (options.removeUnusedDependencies) {
        var usedDependencies = dependencies.filter(function (dependency) {
          return unusedDependencies.indexOf(dependency) < 0;
        });

        var usedPaths = paths.filter(function (dependency) {
          return unusedPaths.indexOf(dependency) < 0;
        });

        match = match.replace(pathsStr, usedPaths.join(', ')).replace(dependenciesStr, usedDependencies.join(', '));
      }

      return match;
    });

    return {
      output: output,
      results: results
    };
  },

  logResult = function (result) {
    if (options.logModuleId && result.moduleId) {
      grunt.log.writeln('module id:', result.moduleId);
    }

    if (options.logDependencyPaths && result.paths.length) {
      grunt.log.writeln('paths:', result.paths.join(', '));
    }

    if (options.logDependencyNames && result.dependencies.length) {
      grunt.log.writeln('dependencies:', result.dependencies.join(', '));
    }

    if (options.logUnusedDependencyPaths && result.unusedPaths.length) {
      grunt.log.writeln('Unused paths: ' + result.unusedPaths.join(', '));
    }

    if (options.logUnusedDependencyNames && result.unusedDependencies.length) {
      grunt.log.writeln('Unused dependencies: ' + result.unusedDependencies.join(', '));
    }
  };

  grunt.registerMultiTask('amd_dependency_checker', 'Finds and removes unused dependencies in AMD modules.', function() {
    // Merge task-specific and/or target-specific options with these defaults.
    options = this.options({
      excepts: [],
      logFilePath: true,
      logModuleId: false,
      logDependencyPaths: false,
      logDependencyNames: false,
      logUnusedDependencyPaths: true,
      logUnusedDependencyNames: false,
      removeUnusedDependencies: true
    });

    options.logFilePath = options.logFilePath || options.logDependencyPaths || options.logDependencyNames || options.logUnusedDependencyPaths || options.logUnusedDependencyNames;

    var filesCounter = 0,
        unusedCounter = 0,
        filesWithUnusedDependenciesCounter = 0;

    // Iterate over all specified file groups.
    this.files.forEach(function(f) {
      // Concat specified files.
      var dest = f.dest;
      var src = f.src.filter(function(filepath) {
        // Warn on and remove invalid source files (if nonull was set).
        if (!grunt.file.exists(filepath)) {
          grunt.log.warn('Source file "' + filepath + '" not found.');
          return false;
        } else {
          ++filesCounter;
          return true;
        }
      }).forEach(function(filepath) {
        if (options.logFilePath) {
          grunt.log.write(filepath);
        }

        var processResult = processFile(filepath),
            results = processResult.results;

        if (options.logFilePath) {
          grunt.log.writeln(' (' + (results.length ? results.length : 'no') + ' module' + (results.length > 1 ? 's' : '') + ')');
        }

        var fileHasUnusedDependencies = false;

        results.forEach(function (result) {
          var unusedDependencies = result.unusedDependencies;

          if (unusedDependencies.length) {
            fileHasUnusedDependencies = true;
            unusedCounter += unusedDependencies.length;
          }

          logResult(result);
        });

        if (fileHasUnusedDependencies) {
          ++filesWithUnusedDependenciesCounter;
          grunt.log.writeln();
        }

        if (options.removeUnusedDependencies) {
          grunt.file.write(dest, processResult.output);
        }
      });
    });

    grunt.log.writeln();
    grunt.log.writeln('Total unused dependencies: ' + unusedCounter + ' in ' + filesWithUnusedDependenciesCounter + ' files.');
    grunt.log.writeln('Total processed files: ' + filesCounter);
  });

};
