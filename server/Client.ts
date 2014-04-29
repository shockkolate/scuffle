module Scuffle {
	export class Client {
		game : ServerGame
		socket : any
		protocol : any
		instance : Instance
		player : Player
		weapon : Activator
		state : { [ k : string] : boolean }

		makeProtocol() {
			var proto : any = {}
			proto[Protocol.Client.Ping] = (id : string) => this.socket.emit(Protocol.Server.Ping, id)
			proto[Protocol.Client.StateOn] = (name : string) => {
				this.state[name] = true
				this.socket.emit(Protocol.Server.StateOn, name)
				if(this.instance !== undefined && this.player !== undefined)
					this.game.io.sockets.in(this.instance.id).emit(Protocol.Server.InstancePlayerStateOn, this.player.id, name)
			}
			proto[Protocol.Client.StateOff] = (name : string) => {
				this.state[name] = false
				this.socket.emit(Protocol.Server.StateOff, name)
				if(this.instance !== undefined && this.player !== undefined)
					this.game.io.sockets.in(this.instance.id).emit(Protocol.Server.InstancePlayerStateOff, this.player.id, name)
			}
			proto[Protocol.Client.MapGet] = (name : string) => {
				if(this.game.maps[name] !== undefined)
					this.socket.emit(Protocol.Server.MapGet, this.game.maps[name])
				else
					this.socket.emit(Protocol.Server.MapNotFound, name)
			}
			proto[Protocol.Client.InstanceJoin] = (id : number) => {
				if(this.instance === undefined)
					if(this.game.instances[id] !== undefined) {
						this.instance = this.game.instances[id]
						this.socket.join(id)
						this.socket.emit(Protocol.Server.InstanceJoin, id)
						this.socket.emit(Protocol.Server.InstanceMapChange, this.instance.map.name)
					}
					else
						this.socket.emit(Protocol.Server.InstanceNotFound, id)
				else
					this.socket.emit(Protocol.Server.InstanceIn, this.instance.id)
			}
			proto[Protocol.Client.InstanceReady] = () => {
				if(this.instance !== undefined) {
					this.instance.newPlayer(this)
					this.socket.broadcast.to(this.instance.id).emit(Protocol.Server.InstancePlayerAdd, this.player.compress(3))
					this.instance.forEachPlayer((player : Player) => {
						this.socket.emit(Protocol.Server.InstancePlayerAdd, player.compress(3))
					})
					this.socket.emit(Protocol.Server.InstanceYou, this.player.id)
					this.instance.spawn(this.player.id)
				}
				else
					this.socket.emit(Protocol.Server.InstanceNone)
			}
			proto[Protocol.Client.InstanceMeLook] = (angle : number) => {
				if(this.instance !== undefined)
					this.player.angle = angle
				else
					this.socket.emit(Protocol.Server.InstanceNone)
			}
			proto.disconnect = () => {
				if(this.instance !== undefined && this.player !== undefined) {
					this.socket.broadcast.to(this.instance.id).emit(Protocol.Server.InstancePlayerRemove, this.player.id)
					this.instance.removePlayer(this.player.id)
					this.instance = undefined
					this.player = undefined
				}
			}
			return proto
		}

		constructor(game : ServerGame, socket) {
			this.game = game
			this.socket = socket
			this.protocol = this.makeProtocol()
			this.state = {}
			this.weapon = new Activator(300)

			this.weapon.predicate = () => {
				return this.player.isAlive() &&
				      (this.state['mouse.left'] || this.state['key.space'])
			}

			this.weapon.callback = () => {
				var bullet = this.instance.newBullet(this.player.id)
				var colors = [
					0xff0000,
					0xff8800,
					0xffff00,
					0x00ff00,
					0x55aaff,
					0xff00ff,
					0x5500ff,
					0xaaccff
				]
				bullet.color = colors[Math.floor(Math.random() * colors.length)]
				var angle = this.player.angle// + (Math.random() - 0.5) / 10
				bullet.velocity.x = Math.cos(angle)
				bullet.velocity.y = Math.sin(angle)
				bullet.velocity.scale(0.7)
				bullet.pos = Point.prototype.copy.call(this.player.pos)
				bullet.pos.add(bullet.velocity.x * this.player.radius,
				               bullet.velocity.y * this.player.radius)
				bullet.radius = 2.5 / Math.min(1.5, Math.max(1, this.player.streak / 3))
				this.game.io.sockets.in(this.instance.id).emit(Protocol.Server.InstanceBulletAdd, bullet.compress(4))
			}

			for(var fk in this.protocol) {
				var fv= this.protocol[fk]
				this.socket.on(fk, fv)
			}
		}

		tick(time : number) {
			this.weapon.tick(time)
			if(this.player.isAlive())
				this.tickMovement(time)
		}

		tickMovement(time : number) {
			tickPlayerMovement(time, this.state, this.player, this.instance.map)
			this.game.io.sockets.in(this.instance.id).volatile.emit(Protocol.Server.InstancePlayerMove,
							this.player.id, Point.prototype.compress.call(this.player.pos, 3))
		}
	}
}
