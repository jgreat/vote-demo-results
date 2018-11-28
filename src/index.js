var express = require('express')
var async = require('async')
var cookieParser = require('cookie-parser')
var bodyParser = require('body-parser')
var methodOverride = require('method-override')
var envs = require('envs')
var { Pool, Client } = require('pg')

var debug = envs('DEBUG')
var config = {
  server: {
    listenIp: envs('LISTEN_IP', '0.0.0.0'),
    listenPort: envs('LISTEN_PORT', 8000),
  },
  app: {
    optionA: envs('VOTE_OPTION_A', "Dumpster"),
    optionB: envs('VOTE_OPTION_B', "Tire")
  },
  pg: {
    host: envs('POSTGRES_HOST', 'postgresql'),
    user: envs('POSTGRES_USER', 'vote'),
    password: envs('POSTGRES_PASSWORD', 'vote'),
    database: envs('POSTGRES_DB', 'vote'),
    port: envs('POSTGRES_DB_PORT', '5432')
  },
}

if (debug) console.log('---Config---')
if (debug) console.log(JSON.stringify(config, null, 4))

var pool = new Pool(config.pg)

var app = express()
var server = require('http').Server(app)
var io = require('socket.io')(server)

io.set('transports', ['polling'])

io.sockets.on('connection', function (socket) {
  socket.emit('message', { text : 'Welcome!' })
  socket.on('subscribe', function (data) {
    socket.join(data.channel)
  })
})

getVotes()

function getVotes() {
  var allVotes = []
  var data = {}

  async.parallel([
    function (callback) {
      pool.query({
        text: 'SELECT id, vote, ts FROM votes',
      }).then(function(results) {
        if (debug) console.log("allVotes: ", JSON.stringify(results.rows, null, 4))
        allVotes = results.rows
        callback()
      }).catch(function(err) {
        console.log('SQL Error:', err )
        callback()
      })
    },
    function (callback) {
      pool.query({
        text: 'SELECT vote, COUNT(id) AS count FROM votes GROUP BY vote',
      }).then(function(results) {
        if (debug) console.log("count: ", JSON.stringify(results.rows, null, 4))
        results.rows.forEach(function(val, idx, array) {
          data[val.vote] = val.count
        })
        callback()
      }).catch(function(err) {
        console.log('SQL Error:', err )
        callback()
      })
    }
  ], function(err) {
    data.allVotesArr = allVotes
    if (debug) console.log("scores", JSON.stringify(data, null, 4))
    io.sockets.emit("scores", JSON.stringify(data))
    setTimeout(function() { getVotes() }, 5000)
  })
}

app.use(cookieParser())
app.use(bodyParser())
app.use(methodOverride('X-HTTP-Method-Override'))
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*")
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept")
  res.header("Access-Control-Allow-Methods", "PUT, GET, POST, DELETE, OPTIONS")
  next()
})

app.use(express.static(__dirname + '/../views'))

app.get('/', function (req, res) {
  res.sendFile(path.resolve(__dirname + '/../views/index.html'))
})

server.listen(config.server.listenPort, function () {
  var port = server.address().port
  console.log('App running on port ' + port)
})
