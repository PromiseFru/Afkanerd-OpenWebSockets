var __DBCLIENT__ = require('./../__ENTITIES__/DBClient.js');
var __MYSQL_CONNECTOR__ = require('./../MYSQL_CONNECTION.js');
const JsonSocket = require('json-socket');
const Socket = require ('net');
'use strict'

module.exports =
class Cl_Sockets {
	constructor(mysqlConnection, __ID__, __TOKEN__){
		this.mysqlConnection = mysqlConnection;
	}

	get getErrorCode() {}

	getAllPendingRequest( client_token, client_id ) {
		return new Promise((resolve, reject) => {
			console.log("=> GETTING PENDING FOR CLIENT WITH - ID/[%s] - TOKEN/[%s]", client_id, client_token);
			let fetchAllRequestQuery = "SELECT ID FROM __DEKU_SERVER__.REQUEST WHERE __STATUS__ = 'not_sent' AND CLIENT_ID= ? AND CLIENT_TOKEN = ?";
			this.mysqlConnection.query(fetchAllRequestQuery, [ client_id, client_token ], ( error, results )=> {
				if( error ) {
					reject( error );
					return;
				}
				if( results.length < 1 ) resolve();
				let fetchAllQuery = "SELECT * FROM __DEKU_SERVER__.__REQUEST__ WHERE __STATUS__ = 'not_sent' AND REQ_ID IN (?)";
				let ids = (()=>{
					let v_data = []
					for(let i in results) {
						v_data.push(results[i].ID);
					}
					return v_data;
				})();
				this.mysqlConnection.query(fetchAllQuery, [ ids ], ( error, results ) => {
					if( error ) {
						reject( error );
						return;
					}

					// TODO: Format results
					let messages = []
					for( let i in results ) {
						messages.push( {
							id : results[i].__ID__,
							message : results[i].__MESSAGE__,
							number : results[i].__PHONENUMBER__,
							req_id : results[i].REQ_ID
						});
					}
					resolve( messages );
				});
			});
		});
	}


	changePendingStates( messages ) {
		// TODO: This is very inefficient, use a loop to join all the statements and use one statement instead of multipl statements
		return new Promise((resolve, reject) => {
			let ids = (()=>{
				let req_id = []
				let message_id = []
				for(let i in messages) {
					message_id.push(messages[i].id);
					req_id.push(messages[i].req_id);
				}
				return {"req_id":req_id, "message_id":message_id}
			})();
			console.log( ids );

			let changeStates = "UPDATE __DEKU_SERVER__.__REQUEST__ SET __STATUS__ = 'sent' WHERE __ID__ IN (?)";
			this.mysqlConnection.query(changeStates, [ids.message_id], (error, results) => {
				if( error ) {
					console.error( error );
					reject( error );
					return;
				}
				console.log("=> UPDATED MESSAGE REQUEST SUCCESSFULLY");
				changeStates = "UPDATE __DEKU_SERVER__.REQUEST SET __STATUS__ = 'sent' WHERE ID IN (?)";
				this.mysqlConnection.query(changeStates, [ids.req_id], (error, results) => {
					if( error ) {
						console.error( error );
						reject( error );
						return;
					}
					console.log("=> UPDATED REQUEST COLLECTION SUCCESSFULLY");
				});

			});
			resolve();
		});
	}

	removeClient( client ) {
		delete this.socket.connectedClients[client.uAuth_key];
		console.log("=> CLIENTS DROPPED TO [%d]", Object.keys(this.socket.connectedClients).length);
	}

	start() {
		this.socket = new Socket.Server();

		let PromisedSocket = new Promise( async (resolve, reject) => {
			const connectionOptions = {
				port : '3000'
			}
			
			this.socket.listen(connectionOptions, ()=>{
				this.socket.connectedClients = {}
				resolve(this.socket);
				console.log("=> SOCKET SERVER STARTED ON PORT [%s]", connectionOptions.port);
			});
		})

		this.socket.on('connection', ( client )=>{
			console.log("==================\n=> NEW CLIENT CONNECTION MADE\n===================");
			client = new JsonSocket ( client );


			// Sample test messages could go here while developing
			// Request standard 
			// Format = [Array]
			// Important note: Last request contains the req_id, should not be left out
			/*
			const testRequestSample = [
				{
					message : new Date().toDateString(),
					number : '000000000'
				},
				{
					req_id : Number(new Date().valueOf()),
				}
			]
			client.sendMessage( testRequestSample, ( something ) => { console.log( "=> TEST REQUEST SENT" ) } );
			*/

			client.on('message', async ( data )=>{
				console.log("CLIENT:=> NEW MESSAGE");
				console.log( data );

				if( data.hasOwnProperty( "type") ) {
					switch( data.type ) {
						case "auth":
						if( data.hasOwnProperty("token") && data.hasOwnProperty("id")) {
							let client_key = data.token+data.id;
							this.socket.connectedClients[client_key] = client;

							client.uAuth_key = client_key;
							client.client_token = data.token;
							client.client_id = data.id;

							console.log("=> CLIENT AUTHENTICATED");
							console.log("=> CLIENTS NOW AT [%d]", Object.keys(this.socket.connectedClients).length);
						}
						else {
							console.error("=> INVALID AUTH REQUEST");
							break;
						}
						break;

						case "notification":
						if( data.message == "ready") {
							console.log("=> CLIENT REQUESTING ALL PENDING REQUEST");
							try {
								let messages = await this.getAllPendingRequest( client.client_token, client.client_id); // This should be for a specific client
								// console.log( messages );
								
								//Once transmistted to client, should change all their states
								if( typeof messages == "undefined" || messages.length < 1) break;
								client.sendMessage( messages );
								let results = await this.changePendingStates( messages );
								// console.log( results );
							}
							catch( error ) {
								console.log( error ) ;
							}
							//client.sendMessage( messages, ()=> { console.log("=> FORWARDED ALL PENDING REQUEST TO CLIENT") );
						}
						break;

						default:
						break;
					}
				}
			})

			client.on("error",async ()=>{
				console.log("CLIENT:=> ERROR WITH CONNECTED CLIENT");
				// this.removeClient( client );
			})

			client.on("close",async ()=>{
				console.log("CLIENT:=> CLIENT CONNECTION CLOSED");
				this.removeClient( client );
			})

			client.on("request_signal", async() => {
				console.log("CLIENT:=> NEW REQUEST SIGNAL");
			});
		})
		return PromisedSocket;
	}
}
