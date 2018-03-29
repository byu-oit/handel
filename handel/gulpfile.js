const gulp = require('gulp');
const ts = require('gulp-typescript');
const tsProject = ts.createProject('tsconfig.json');
const fs = require('fs-extra');
const path = require('path');
const runSeq = require('run-sequence');
const mergeStream = require('merge-stream');

gulp.task('clean', (done) => {
    fs.remove(path.join(__dirname, 'dist'), done);
});

gulp.task('build', (done) => {
    runSeq('clean', ['compile'], done);
});

gulp.task('compile', () => {
    let tsReporter = ts.reporter.defaultReporter();
    return mergeStream(
        tsProject.src().pipe(tsProject(tsReporter)),
        gulp.src(['src/**/*', '!src/**/*.ts'])
    )
    .pipe(gulp.dest('dist'));  
});
