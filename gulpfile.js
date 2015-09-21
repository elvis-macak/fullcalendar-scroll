var args        = require('yargs').argv,
    path        = require('path'),
    flip        = require('css-flip'),
    through     = require('through2'),
    gulp        = require('gulp'),
    $           = require('gulp-load-plugins')(),
    gulpsync    = $.sync(gulp),
    browserSync = require('browser-sync').create(),
    PluginError = $.util.PluginError,
    del         = require('del');

// production mode (see build task)
var isProduction = false;
// styles sourcemaps
var useSourceMaps = false;

// Angular template cache
// Example:
//    gulp --usecache
var useCache = args.usecache;

// ignore everything that begins with underscore
var hidden_files = '**/_*.*';
var ignored_files = '!'+hidden_files;

// MAIN PATHS
var paths = {
  app:     '../static/',
  markup:  'jade/',
  styles:  'less/',
  scripts: 'js/',
  images:  'img/',
  i18n:  'i18n/',
  data:  'data/'
}


// VENDOR CONFIG
var vendor = {
  // vendor scripts required to start the app
  base: {
    source: require('./vendor.base.json'),
    dest: '../static/js',
    name: 'base.js'
  },
  // vendor scripts to make the app work. Usually via lazy loading
  app: {
    source: require('./vendor.json'),
    dest: '../static/vendor'
  }
};

// SOURCES CONFIG
var source = {
  scripts: [paths.scripts + 'app.module.js',
            // template modules
            paths.scripts + 'modules/**/*.module.js',
            paths.scripts + 'modules/**/*.js',
            // view modules
            paths.scripts + 'views/**/*.module.js',
            paths.scripts + 'views/**/*.js',
            //resource  modules
            paths.scripts + 'resources/*.module.js',
            paths.scripts + 'resources/*.js'
  ],
  templates: {
    index: [paths.markup + 'index.*'],
    views: [paths.markup + '**/*.*', '!' + paths.markup + 'index.*']
  },
  styles: {
    app:    [ paths.styles + '*.*'],
    themes: [ paths.styles + 'themes/*'],
    watch:  [ paths.styles + '**/*', '!'+paths.styles+'themes/*']
  },
  i18n: {
    files: [ paths.i18n + '*.*'],
  },
  images: {
    files:  [ paths.images + '**/*']
  },
  data: {
    files:  [ paths.data + '**/*']
  }
};

// BUILD TARGET CONFIG
var build = {
  scripts: paths.app + 'js',
  styles:  paths.app + 'css',
  images: paths.app + 'img',
  i18n:  paths.app + 'i18n',
  data:  paths.app + 'data',
  templates: {
    index: paths.app,
    views: paths.app,
    cache: paths.app + 'js/' + 'templates.js',
  }
};

// PLUGINS OPTIONS

var prettifyOpts = {
  indent_char: ' ',
  indent_size: 3,
  unformatted: ['a', 'sub', 'sup', 'b', 'i', 'u', 'pre', 'code']
};

var vendorUglifyOpts = {
  mangle: {
    except: ['$super'] // rickshaw requires this
  }
};

var tplCacheOptions = {
  root: 'app',
  filename: 'templates.js',
  //standalone: true,
  module: 'app.core',
  base: function(file) {
    return file.path.split('jade')[1];
  }
};

var injectOptions = {
  name: 'templates',
  transform: function(filepath) {
    return 'script(src=\'' +
              filepath.substr(filepath.indexOf('app')) +
            '\')';
  }
}

//---------------
// TASKS
//---------------


// JS APP
gulp.task('scripts:app', function() {
    log('Building scripts..');
    // Minify and copy all JavaScript (except vendor scripts)
    return gulp.src(source.scripts)
        .pipe($.jsvalidate())
        .on('error', handleError)
        .pipe( $.if( useSourceMaps, $.sourcemaps.init() ))
        .pipe($.concat( 'app.js' ))
        .pipe($.ngAnnotate())
        .on('error', handleError)
        .pipe( $.if(isProduction, $.uglify({preserveComments:'some'}) ))
        .on('error', handleError)
        .pipe( $.if( useSourceMaps, $.sourcemaps.write() ))
        .pipe(gulp.dest(build.scripts));
});


// VENDOR BUILD
gulp.task('vendor', gulpsync.sync(['vendor:base', 'vendor:app']) );

// Build the base script to start the application from vendor assets
gulp.task('vendor:base', function() {
    log('Copying base vendor assets..');
    return gulp.src(vendor.base.source)
        .pipe($.expectFile(vendor.base.source))
        .pipe($.if( isProduction, $.uglify() ))
        .pipe($.concat(vendor.base.name))
        .pipe(gulp.dest(vendor.base.dest))
        ;
});

// copy file from bower folder into the app vendor folder
gulp.task('vendor:app', function() {
  log('Copying vendor assets..');

  var jsFilter = $.filter('**/*.js');
  var cssFilter = $.filter('**/*.css');

  return gulp.src(vendor.app.source, {base: 'bower_components'})
      .pipe($.expectFile(vendor.app.source))
      .pipe(jsFilter)
      .pipe($.if( isProduction, $.uglify( vendorUglifyOpts ) ))
      .pipe(jsFilter.restore())
      .pipe(cssFilter)
      .pipe($.if( isProduction, $.minifyCss() ))
      .pipe(cssFilter.restore())
      .pipe( gulp.dest(vendor.app.dest) );

});

// APP LESS
gulp.task('styles:app', function() {
    log('Building application styles..');
    return gulp.src(source.styles.app)
        .pipe( $.if( useSourceMaps, $.sourcemaps.init() ))
        .pipe( $.less() )
        .on('error', handleError)
        .pipe( $.if( isProduction, $.minifyCss() ))
        .pipe( $.if( useSourceMaps, $.sourcemaps.write() ))
        .pipe(gulp.dest(build.styles));
});

// LESS THEMES
gulp.task('styles:themes', function() {
    log('Building application theme styles..');
    return gulp.src(source.styles.themes)
        .pipe( $.less() )
        .on('error', handleError)
        .pipe(gulp.dest(build.styles));
});

// JADE
gulp.task('templates:index', ['templates:views'], function() {
    log('Building index..');

    var tplscript = gulp.src(build.templates.cache, {read: false});
    return gulp.src(source.templates.index)
        .pipe( $.if(useCache, $.inject(tplscript, injectOptions)) ) // inject the templates.js into index
        .pipe( $.jade() )
        .on('error', handleError)
        .pipe($.htmlPrettify( prettifyOpts ))
        .pipe(gulp.dest(build.templates.index))
        ;
});

// JADE
gulp.task('templates:views', function() {
    log('Building views.. ' + (useCache?'using cache':''));

    if(useCache) {

      return gulp.src(source.templates.views)
          .pipe($.jade())
          .on('error', handleError)
          .pipe($.angularTemplatecache(tplCacheOptions))
          .pipe( $.if(isProduction, $.uglify({preserveComments:'some'}) ))
          .pipe(gulp.dest(build.scripts));
          ;
    }
    else {

      return gulp.src(source.templates.views)
          .pipe( $.if( !isProduction, $.changed(build.templates.views, { extension: '.html' }) ))
          .pipe($.jade())
          .on('error', handleError)
          .pipe($.htmlPrettify( prettifyOpts ))
          .pipe(gulp.dest(build.templates.views))
          ;
    }
});

// i18n
gulp.task('i18n:files', function() {
    log('Copying i18n files..');

    return gulp.src(source.i18n.files)
        .pipe(gulp.dest(build.i18n))
        ;
});

// images
gulp.task('images:files', function() {
    log('Copying images files..');

    return gulp.src(source.images.files)
        .pipe(gulp.dest(build.images))
        ;
});

// data
gulp.task('data:files', function() {
    log('Copying data files..');

    return gulp.src(source.data.files)
        .pipe(gulp.dest(build.data))
        ;
});

//---------------
// WATCH
//---------------

// Rerun the task when a file changes
gulp.task('watch', function() {
  log('Starting watch and LiveReload..');

  gulp.watch(source.scripts,         ['scripts:app']);
  gulp.watch(source.styles.watch,    ['styles:app']);
  gulp.watch(source.styles.themes,   ['styles:themes']);
  gulp.watch(source.templates.views, ['templates:views']);
  gulp.watch(source.i18n.files,      ['i18n:files']);
  gulp.watch(source.data.files,      ['data:files']);

});

// lint javascript
gulp.task('lint', function() {
    return gulp
        .src(source.scripts)
        .pipe($.jshint())
        .pipe($.jshint.reporter('jshint-stylish', {verbose: true}))
        .pipe($.jshint.reporter('fail'));
});

// Remove all files from the build paths
gulp.task('clean', function(done) {
    var delconfig = [].concat(paths.app);

    log('Cleaning: ' + $.util.colors.blue(delconfig));
    // force: clean files outside current directory
    del(delconfig, {force: true}, done);
});

//---------------
// MAIN TASKS
//---------------

// build for production (minify)
gulp.task('build', gulpsync.sync([
          'prod',
          'vendor',
          'assets'
        ]));

gulp.task('bs', function() {
    var files = ["../static/js/*.*", "../static/css/*.*", "../static/views/*.*"]
    browserSync.init(files, {
        server: {
            host: "0.0.0.0",
            port: "3000",
            proxy: "http://192.168.33.10:5000",
            baseDir: ".."
        }
    });
});

gulp.task('prod', function() {
  log('Starting production build...');
  isProduction = true;
});

// build with sourcemaps (no minify)
gulp.task('sourcemaps', ['usesources', 'default']);
gulp.task('usesources', function(){ useSourceMaps = true; });

// default (no minify)
gulp.task('default', gulpsync.sync([
          'vendor',
          'assets',
          'watch'
        ]), function(){

  log('************');
  log('* All Done * You can start editing your code, LiveReload will update your browser after any change..');
  log('************');

});

gulp.task('assets',[
          'scripts:app',
          'styles:app',
          'styles:themes',
          'templates:index',
          'templates:views',
          'i18n:files',
          'images:files',
          'data:files',
        ]);


/////////////////////


// Error handler
function handleError(err) {
  log(err.toString());
  this.emit('end');
}

// log to console using
function log(msg) {
  $.util.log( $.util.colors.blue( msg ) );
}
