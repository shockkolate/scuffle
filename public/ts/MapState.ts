module Scuffle {
	export class MapState extends Phaser.State {
		game : Game
		map : Map
		protocol : any
		players : { [k : number] : ClientPlayer }
		bullets : { [k : number] : ClientBullet }
		me : number
		music : Phaser.Sound
		sndBullet : Phaser.Sound
		group : Phaser.Group
		gButtons : Phaser.Group
		lineOfSight : Phaser.Graphics
		ownHealth : Phaser.Graphics
		notices : Phaser.Group[]
		scoreboard : Scoreboard

		init(map : Scuffle.Map) {
			this.map = map
			this.players = {}
			this.bullets = {}
			this.notices = []
		}

		makeProtocol() {
			var proto : any = {}
			proto[Protocol.Server.Batch] = (combined : any[]) => {
				if(combined.length % 2 === 1)
					--combined.length
				for(var i=0; i<combined.length; i+=2)
					if(proto[combined[i]] !== undefined)
						proto[combined[i]].apply(undefined, combined[i+1])
			}
			proto[Protocol.Server.InstancePlayerAdd] = (player : any) => {
				player = Player.uncompress(player)
				var cli = this.players[player.id]
				if(cli === undefined) {
					var g = this.add.graphics(player.pos.x, player.pos.y, this.group)
					g.alpha = 0
					this.add.tween(g).to({ alpha: 1 }, 400, Phaser.Easing.Linear.None, true)

					cli = new ClientPlayer(player, g)
					cli.redraw()
					this.players[player.id] = cli
					this.scoreboard.addRowFor(cli)
				}
				else
					cli.setPlayer(player)
			}
			proto[Protocol.Server.InstanceYou] = (id : number) => {
				this.me = id
				var cli = this.players[id]
				cli.isMe = true
				cli.state = this.game.localState
				cli.graphics.addChild(this.lineOfSight)
				cli.graphics.addChild(this.ownHealth)
				this.lineOfSight.alpha = 1
				if(cli.player.isAlive())
					this.focusOn(cli)
				this.scoreboard.update()
			}
			proto[Protocol.Server.InstancePlayerRemove] = (id : number) => {
				var cli = this.players[id]
				this.scoreboard.removeRowFor(cli)
				this.add.tween(cli.graphics).to({ alpha: 0 }, 400, Phaser.Easing.Linear.None, true)
					.onComplete.add(() => cli.destroy())
				delete this.players[id]
			}
			proto[Protocol.Server.InstancePlayerStateOn] = (id : number, name : string) => {
				this.players[id].state[name] = true
			}
			proto[Protocol.Server.InstancePlayerStateOff] = (id : number, name : string) => {
				this.players[id].state[name] = false
			}
			proto[Protocol.Server.InstancePlayerSpawn] = (player : any) => {
				player = Player.uncompress(player)
				var cli = this.players[player.id]
				cli.setPlayer(player)
				cli.graphics.alpha = 0
				this.add.tween(cli.graphics).to({ alpha: 1 }, 400, Phaser.Easing.Linear.None, true)
				if(player.id == this.me) {
					this.updateHealth()
					this.focusOn(cli)
				}
			}
			proto[Protocol.Server.InstancePlayerMove] = (id : number, pos : any) => {
				pos = Point.uncompress(pos)
				var cli = this.players[id]
				if(cli !== undefined) {
					var vDiff = cli.player.pos.subtractedFromPoint(pos)
					if(vDiff.length() > 40 || this.game.paused)
						cli.move(pos)
					else {
						vDiff.scale(Math.max(0.001, Math.min(0.005, cli.player.velocity.length() * this.game.latency)))
						cli.player.velocity.addPoint(vDiff)
					}
					vDiff.pool()
					if(id == this.me)
						this.focusOn(cli)
				}
			}
			proto[Protocol.Server.InstancePlayerDilate] = (id : number, dilation : number) => {
				this.players[id].player.dilation = dilation
			}
			proto[Protocol.Server.InstancePlayerHurt] = (id : number, hp : number) => {
				this.players[id].player.health = hp
				if(id == this.me)
					this.updateHealth()
			}
			proto[Protocol.Server.InstancePlayerKill] = (id : number, idKiller : number) => {
				var plKilled = this.players[id].player
				var plKiller = this.players[idKiller].player
				++plKiller.kills
				++plKiller.streak

				var grp = this.add.group()
				var style = { font: '30px VT323' }
				var tKilled = this.add.text(this.game.width - 10, 0, ' ' + plKilled.name, style, grp)
				tKilled.anchor.x = 1
				tKilled.fill = id == this.me ? '#fff' : '#bdf'
				tKilled.alpha = id == this.me ? 1 : 0.6
				var arrow = this.add.sprite(tKilled.x - tKilled.width, 0, 'bullet.arrow1', undefined, grp)
				arrow.scale.setTo(0.5, 0.5)
				arrow.anchor.x = 1
				arrow.alpha = idKiller == this.me ? 1 : 0.6
				var style = { font: '30px VT323' }
				var tKiller = this.add.text(arrow.x - arrow.width, 0, plKiller.name + ' ', style, grp)
				tKiller.anchor.x = 1
				tKiller.fill = idKiller == this.me ? '#fff' : '#bdf'
				tKiller.alpha = idKiller == this.me ? 1 : 0.6
				this.addNotice(grp, (id == this.me || idKiller == this.me) ? 6000 : 3000)

				if(plKilled.streak >= 3) {
					var grp = this.add.group()
					var style = { font: '30px VT323' }
					var t = this.add.text(this.game.width - 10, 0,
									plKilled.name + ' was DESTROYED by ' + plKiller.name + '!', style, grp)
					t.anchor.x = 1
					t.fill = (id == this.me || idKiller == this.me) ? '#fff' : '#bdf'
					t.alpha = (id == this.me || idKiller == this.me) ? 1 : 0.6
					this.addNotice(grp, (id == this.me || idKiller == this.me) ? 6000 : 3000)
				}

				var spreeMessage = (() => {
					switch(plKiller.streak) {
						case 3:
							return ' is on a KILLING SPREE!'
						case 5:
							return ' is DOMINATING!'
						case 9:
							return ' is UNSTOPPABLE!'
						case 15:
							return ' is GODLIKE!'
					}
				})()

				if(spreeMessage !== undefined) {
					var grp = this.add.group()
					var style = { font: '30px VT323' }
					var t = this.add.text(this.game.width - 10, 0, plKiller.name + spreeMessage, style, grp)
					t.anchor.x = 1
					t.fill = idKiller == this.me ? '#fff' : '#bdf'
					t.alpha = idKiller == this.me ? 1 : 0.6
					this.addNotice(grp, idKiller == this.me ? 9000 : 4500)
				}

				++plKilled.deaths
				plKilled.streak = 0
				plKilled.health = 0
				this.add.tween(this.players[id].graphics).to({ alpha: 0 }, 400, Phaser.Easing.Linear.None, true)

				this.scoreboard.update()
			}
			proto[Protocol.Server.InstanceBulletAdd] = (bullet : any) => {
				bullet = Bullet.uncompress(bullet)

				var g = this.add.graphics(bullet.pos.x, bullet.pos.y, this.group)
				g.beginFill(bullet.color, bullet.alpha)
				g.drawCircle(0, 0, bullet.radius)
				g.endFill()
				this.bullets[bullet.id] = new ClientBullet(bullet, g)

				this.sndBullet.play('main', 0, 0.8, false, true)
			}
			proto[Protocol.Server.InstanceBulletRemove] = (id : number) => {
				this.bullets[id].destroy()
				delete this.bullets[id]
			}
			proto[Protocol.Server.InstanceBulletMove] = (id : number, pos : any) => {
				this.bullets[id].move(Point.uncompress(pos))
			}
			proto[Protocol.Server.InstanceBulletDilate] = (id : number, dilation : number) => {
				this.bullets[id].bullet.dilation = dilation
			}
			return proto
		}

		create() {
			this.stage.backgroundColor = 0x0e0e0c
			this.camera.bounds.x = -Infinity
			this.camera.bounds.y = -Infinity
			this.camera.bounds.width = Infinity
			this.camera.bounds.height = Infinity

			this.music = this.add.audio(this.map.name)
			var patternDuration = 1.79332
			/*this.music.addMarker('start', 0, patternDuration)
			this.music.addMarker('main', patternDuration, patternDuration * 24, undefined, true)
			this.music.onMarkerComplete.add((marker : string) => {
				if(marker === 'start')
					setTimeout(() => {
						this.music.play('main', 0, undefined, true)
					}, 0)
			})
			this.music.play('start')*/
			this.sndBullet = this.add.audio('beep2')
			this.sndBullet.addMarker('main', 0, 0.02)

			this.group = this.add.group()
			this.group.scale.setTo(2, 2)
			this.group.alpha = 0
			this.add.tween(this.group).to({alpha: 1}, 400, Phaser.Easing.Linear.None, true)

			this.gButtons = this.add.group()
			this.addButton('audio.button', 0, () => this.sound.mute = !this.sound.mute)
			this.addButton('screen1', 1, () => this.scale.startFullScreen(false))
			this.addButton('crosshair2', 2, () => this.input.mouse.requestPointerLock())

			this.map.sprites.forEach(sprite => {
				var image : any = this.cache.getImage(sprite.source)
				var s = this.add.sprite(sprite.pos.x, sprite.pos.y, sprite.source, 0, this.group)
				s.scale.setTo(sprite.size.x / image.width, sprite.size.y / image.height)
			})
			this.map.lines.forEach(line => {
				var graphics = this.add.graphics(0, 0, this.group)
				graphics.lineStyle(line.width || this.map.lineWidth || 2,
				                   parseInt(line.color) || parseInt(this.map.lineColor) || 0xffffff, 1)
				graphics.moveTo(line.a.x, line.a.y)
				graphics.lineTo(line.b.x, line.b.y)
			})

			this.lineOfSight = this.add.graphics(0, 0, this.group)
			this.lineOfSight.alpha = 0
			this.lineOfSight.lineStyle(1, 0xaa0000, 1)
			this.lineOfSight.moveTo(0, 0)
			this.lineOfSight.lineTo(60, 0)
			this.ownHealth = this.add.graphics(0, 0, this.group)

			this.scoreboard = new Scoreboard(this.game)
			var kTab = this.game.input.keyboard.addKey(Phaser.Keyboard.TAB)
			kTab.onDown.add(() => this.scoreboard.show())
			kTab.onUp.add(() => this.scoreboard.hide())

			this.input.mouse.pointerLock.add((state : boolean) => {
				this.add.tween(this.gButtons).to({ alpha: state ? 0 : 1 }, 500, Phaser.Easing.Linear.None, true)
			})

			var px = 0, py = 0
			var pmx = 0, pmy = 0
			this.input.mouse.mouseMoveCallback = e => {
				if(this.me === undefined)
					return

				var mx = e.movementX || e.mozMovementX || e.webkitMovementX || (px ? e.layerX - px : 0)
				var my = e.movementY || e.mozMovementY || e.webkitMovementY || (py ? e.layerY - py : 0)
				pmx = mx + pmx / 1.35
				pmy = my + pmy / 1.35
				px = e.layerX
				py = e.layerY

				if(this.input.mouse.locked) {
					var rad = this.lineOfSight.angle * Math.PI / 180
					this.lineOfSight.angle += (pmx * -Math.sin(rad) + pmy * Math.cos(rad)) / 6
					var radians = this.lineOfSight.angle * Math.PI / 180
				}
				else {
					var radians = Math.atan2(e.layerY - this.game.height / 2, e.layerX - this.game.width / 2)
					this.lineOfSight.angle = radians * 180 / Math.PI
				}
				// clamp angle to range 0:360
				this.lineOfSight.angle -= 360 * Math.floor(this.lineOfSight.angle / 360)
				this.game.socket.emit(Protocol.Client.InstanceMeLook, radians)
			}

			this.protocol = this.makeProtocol()
			for(var fk in this.protocol) {
				var fv = this.protocol[fk]
				this.game.socket.on(fk, fv)
			}
			this.game.socket.emit(Protocol.Client.InstanceReady)
		}

		update() {
			var time = this.game.time.elapsed
			for(var id in this.players) {
				var cli = this.players[id]
				if(cli.player.isAlive()) {
					if(tickPlayerMovement(time, cli.state, cli.player, this.map)) {
						cli.move(cli.player.pos)
						if(id == this.me)
							this.focusOn(cli)
					}
				}
			}

			for(var k in this.bullets) {
				var bullet = this.bullets[k].bullet
				var vel = bullet.velocity.scaledBy(time).scaledBy(bullet.dilation)
				this.bullets[k].moveBy(vel.x, vel.y)
				vel.pool()
			}
		}

		shutdown() {
			this.stage.backgroundColor = 0
			this.camera.setBoundsToWorld()
			this.input.mouse.mouseMoveCallback = undefined
			this.game.socket.removeAllListeners()
			this.music.onMarkerComplete.removeAll()
			this.music.stop()
		}

		addNotice(grp : Phaser.Group, timeout : number) {
			var lineSpacing = 40

			grp.fixedToCamera = true

			if(this.notices.length >= 5) {
				this.notices.shift().destroy(true)
				for(var i=0; i<this.notices.length; ++i) {
					this.notices[i].forEach(child => {
						child.y -= lineSpacing
					}, this)
				}
			}
			this.notices.push(grp)

			var y = 10 + lineSpacing * (this.notices.length - 1)
			grp.forEach(child => { child.y = y }, this)

			grp.alpha = 0
			var tw = this.add.tween(grp).to({ alpha: 1 }, 150, Phaser.Easing.Linear.None, true)
			tw.onComplete.add(() => {
				setTimeout(() => {
					var tw = this.add.tween(grp).to({ alpha: 0 }, 1000, Phaser.Easing.Linear.None, true)
					tw.onComplete.add(() => {
						grp.destroy(true)
						for(var i=0; i<this.notices.length; ++i) {
							if(this.notices[i] === grp) {
								this.notices.splice(i, 1)
								for(var j=i; j<this.notices.length; ++j) {
									this.notices[j].forEach(child => {
										child.y -= lineSpacing
									}, this)
								}
								break
							}
						}
					})
				}, timeout)
			})
		}

		addButton(key : string, index : number, fn : Function) {
			var btn = this.add.button(8 + index * 40, 8, key, fn, this,
							undefined, undefined, undefined, undefined, this.gButtons)
			btn.scale.setTo(0.5, 0.5)
			btn.fixedToCamera = true
			btn.inputEnabled = true
			btn.input.useHandCursor = true
			btn.input.consumePointerEvent = true
			btn.alpha = 0.3
			btn.onInputOver.add(() => {
				this.add.tween(btn).to({ alpha: 0.8 }, 100, Phaser.Easing.Linear.None, true)
			})
			btn.onInputOut.add(() => {
				this.add.tween(btn).to({ alpha: 0.3 }, 100, Phaser.Easing.Linear.None, true)
			})
		}

		focusOn(cli : ClientPlayer) {
			this.camera.focusOnXY(cli.player.pos.x * this.group.scale.x, cli.player.pos.y * this.group.scale.y)
		}

		updateHealth() {
			var pl = this.players[this.me].player
			var green = pl.health / pl.baseHealth * pl.radius * 4
			var red = pl.radius * 4 - green
			this.ownHealth.clear()
			this.ownHealth.beginFill(0x52ff52, 0.8)
			this.ownHealth.drawRect(-pl.radius * 2, pl.radius + 4, green, 2)
			this.ownHealth.endFill()
			this.ownHealth.beginFill(0xff5252, 0.8)
			this.ownHealth.drawRect(-pl.radius * 2 + green, pl.radius + 4, red, 2)
			this.ownHealth.endFill()
		}
	}
}
