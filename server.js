var express = require('express');
var app = express();
app.set('views',__dirname+'/public');
app.use(express.static(__dirname+'/public'));
app.get('*',function(request,response){
	response.render('index');
}).listen(5000,function(){
	console.log('Server started on localhost port 5000');
});