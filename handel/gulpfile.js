const gulp = require('gulp');
const ts = require('gulp-typescript');
const tsProject = ts.createProject('tsconfig.json');
const fs = require('fs-extra');
const path = require('path');
const mergeStream = require('merge-stream');

function clean(done) {
    fs.remove(path.join(__dirname, 'dist'), done);
}

const build = gulp.series(clean, compile);

function compile() {
    let tsReporter = ts.reporter.defaultReporter();
    return mergeStream(
        tsProject.src().pipe(tsProject(tsReporter)),
        gulp.src(['src/**/*', '!src/**/*.ts'])
    )
        .pipe(gulp.dest('dist'));
}

function watchTask() {
    gulp.watch('src/**/*.ts', compile);
}

const watch = gulp.series(build, watchTask);

module.exports = {
    clean: clean,
    build: build,
    compile: compile,
    watch: watch
};
