var redis = require('redis');

var pubSubClient = redis.createClient(6379, '127.0.0.1');
var mainClient = redis.createClient(6379, '127.0.0.1');

var clientID = Date.now() + Math.random();
mainClient.client('setname', clientID);

function publisher() {
    console.log('-', 'PUBLISHER');

    function getMessage() {
        this.cnt = this.cnt || 0;
        return this.cnt++;
    }

    setInterval(function () {
        pubSubClient.publish('channel:messages', getMessage());
    }, 500);
}

function subscriber() {
    console.log('-', 'SUBSCRIBER');

    function eventHandler(msg, callback) {
        function onComplete() {
            var error = Math.random() > 0.85;
            callback(error, msg);
        }

        // processing takes time...
        setTimeout(onComplete, Math.floor(Math.random() * 1000));
    }

    pubSubClient.subscribe('channel:messages');

    pubSubClient.on("message", function (channel, msg) {
        eventHandler(msg, function (err, msg) {

            if (err) {
                console.log(msg);

                mainClient.lpush('logs:errors', msg);
            }
        });
    });
}

function checkAgentStatus() {
    var that = this;

    mainClient.client('list', function (err, doc) {
        if (err) return console.error('error', err);

        var clientsArr = doc.split('\n');
        clientsArr.pop();

        clientsArr = clientsArr.filter(function (a) {
            return !!a.match(/name=([\d\.]+)\s/);
        });
        clientsArr.sort(function (a, b) {
            return (a.match(/id=([\d]+)\s/)[1]) < (b.match(/id=([\d]+)\s/)[1]);
        });

        if (clientsArr.pop().match(/name=([\d\.]+)\s/)[1] == clientID) {
            if (!that.is_master) {
                that.is_master = true;

                pubSubClient.unsubscribe('channel:messages');

                publisher();
            }
        } else if (!that.is_slave) {
            that.is_slave = true;

            subscriber();
        }
    });
}

if (process.argv.length == 3 && process.argv[2] == 'getErrors') {
    mainClient.lrange('logs:errors', 0, -1, function (err, doc) {
        console.log('-', 'LOGS');

        doc.forEach(function (el) {
            console.log(el);
        });
        mainClient.del('logs:errors');
        pubSubClient.quit();
        mainClient.quit();
    });
} else {
    setInterval(checkAgentStatus, 500);
}

