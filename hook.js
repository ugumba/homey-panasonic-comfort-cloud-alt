
function hook_stdouterr(callback) {
    var old_stdout_write = process.stdout.write
    var old_stderr_write = process.stderr.write

    process.stdout.write = (function(write) {
        return function(string, encoding, fd) {
            write.apply(process.stdout, arguments)
            callback(string, encoding, fd)
        }
    })(process.stdout.write)
  
    process.stderr.write = (function(write) {
        return function(string, encoding, fd) {
            write.apply(process.stderr, arguments)
            callback(string, encoding, fd)
        }
    })(process.stderr.write)
  
    return function() {
        process.stdout.write = old_stdout_write
        process.stderr.write = old_stderr_write
    }
}

module.exports = hook_stdouterr;