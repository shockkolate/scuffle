//require('look').start()
var fs = require('fs')
var net = require('net')
var app = require('http').createServer()
var io = require('socket.io').listen(app)
io.set('log level', 2)
io.set('close timeout', 5)
io.set('heartbeat timeout', 10)
io.set('heartbeat interval', 5)
app.listen(1337)

var opts = {
	key:  fs.readFileSync(__dirname + '/ssl/server.key'),
	cert: fs.readFileSync(__dirname + '/ssl/server.crt'),
	ca:   fs.readFileSync(__dirname + '/ssl/ca.crt')
}
require('tls').createServer(opts, stream => {
	var req = net.connect({ port: 1337, host: '127.0.0.1'}, () => {
		stream.pipe(req)
		req.pipe(stream)
	})
}).listen(1338)

setImmediate(() => {
	var game = new Scuffle.ServerGame()
	game.start(io)
})
