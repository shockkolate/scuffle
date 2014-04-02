declare var io : {
	connect(url : string, options? : any) : Socket
}

interface Socket {
	socket : any
	disconnect() : Socket
	on(event : string, callback : (data : any) => void)
	once(event : string, callback : (data : any) => void)
	emit(event : string, data? : any)
	removeAllListeners(event? : string)
}
