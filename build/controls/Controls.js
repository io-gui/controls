import {
	Vector2, Vector3, Plane, PerspectiveCamera, OrthographicCamera, Raycaster, EventDispatcher
} from 'three';

/* eslint-disable @typescript-eslint/no-use-before-define */
// Internal variables
const EPS = 0.05;
const PI = Math.PI;
const HPI = PI / 2;


// Common reusable events
export const CHANGE_EVENT = { type: 'change' };

export const START_EVENT = { type: 'start' };

export const END_EVENT = { type: 'end' };

export const DISPOSE_EVENT = { type: 'dispose' };


/**
 * `ControlsMixin`: Generic mixin for interactive threejs viewport controls.
 * It solves some of the most common and complex problems in threejs control designs.
 *
 * ### Pointer Tracking ###
 *
 * - Captures most relevant pointer and keyboard events and fixes some platform-specific bugs and discrepancies.
 * - Serves as a proxy dispatcher for pointer and keyboard events:
 *   "contextmenu", "wheel", "pointerdown", "pointermove", "pointerup", "pointerleave", "pointerover", "pointerenter", "pointerout", "pointercancel", "keydown", "keyup"
 * - Tracks active pointer gestures and evokes pointer event handler functions with tracked pointer data:
 *   `onTrackedPointerDown`, `onTrackedPointerMove`, `onTrackedPointerHover`, `onTrackedPointerUp`
 * - Enables inertial behaviours via simmulated pointer with framerate-independent damping.
 * - Tracks active key presses and evokes key event handler functions with currently pressed key data:
 *   `onTrackedKeyDown`, `onTrackedKeyUp`, `onTrackedKeyChange`
 *
 * ### Internal Update and Animation Loop ###
 *
 * - Removes the necessity to call `.update()` method externally from external animation loop for damping calculations.
 * - Developers can start and stop per-frame function invocations via `private startAnimation( callback )` and `stopAnimation( callback )`.
 *
 * ### Controls Livecycle ###
 *
 * - Adds/removes event listeners during lifecycle and on `enabled` property change.
 * - Stops current animations when `enabled` property is set to `false`.
 * - Takes care of the event listener cleanup when `dipose()` method is called.
 * - Emits lyfecycle events: "enabled", "disabled", "dispose"
 */
export function ControlsMixin( base ) {

	class MixinClass extends base {

		constructor( ...args ) {

			super( ...args );
			this.enabled = true;
			this.enableDamping = false;
			this.dampingFactor = 0.05;

			// Tracked pointers and keys
			this._hoverPointer = null;
			this._centerPointer = null;
			this._simulatedPointer = null;
			this._pointers = [];
			this._animations = [];
			this._keys = [];

			//
			this._changeDispatched = false;
			this.camera = args[ 0 ];
			this.domElement = args[ 1 ];


			// Runtime contructor arguments check
			if ( this.camera === undefined )
				console.warn( 'THREE.Controls: "camera" parameter is now mandatory!' );

			if ( ! ( this.camera instanceof PerspectiveCamera ) && ! ( this.camera instanceof OrthographicCamera ) )
				console.warn( 'THREE.Controls: Unsupported camera type!' );

			if ( this.domElement === undefined )
				console.warn( 'THREE.Controls: "domElement" parameter is now mandatory!' );

			if ( this.domElement === document )
				console.error( 'THREE.Controls: "domElement" should be "renderer.domElement"!' );


			// Bind handler functions
			this._preventDefault = this._preventDefault.bind( this );
			this._onContextMenu = this._onContextMenu.bind( this );
			this._onWheel = this._onWheel.bind( this );
			this._onPointerDown = this._onPointerDown.bind( this );
			this._onPointerMove = this._onPointerMove.bind( this );
			this._onPointerSimulation = this._onPointerSimulation.bind( this );
			this._onPointerUp = this._onPointerUp.bind( this );
			this._onPointerLeave = this._onPointerLeave.bind( this );
			this._onPointerCancel = this._onPointerCancel.bind( this );
			this._onPointerOver = this._onPointerOver.bind( this );
			this._onPointerEnter = this._onPointerEnter.bind( this );
			this._onPointerOut = this._onPointerOut.bind( this );
			this._onKeyDown = this._onKeyDown.bind( this );
			this._onKeyUp = this._onKeyUp.bind( this );
			this._connect = this._connect.bind( this );
			this._disconnect = this._disconnect.bind( this );
			this.observeProperty( 'enabled', this._connect, this._disconnect );

			// Perform initial `connect()`
			this._connect();

		}

		// Adds property observing mechanism via getter/setter functions. Also emits '[property]-changed' event.
		observeProperty( propertyKey, onChangeFunc, onChangeToFalsyFunc ) {

			let value = this[ propertyKey ];

			Object.defineProperty( this, propertyKey, {
				get() {

					return value;

				},
				set( newValue ) {

					const oldValue = value;
					value = newValue;

					if ( oldValue !== undefined && newValue !== oldValue ) {

						( newValue || ! onChangeToFalsyFunc ) ? ( onChangeFunc && onChangeFunc() ) : onChangeToFalsyFunc();
						this.dispatchEvent( { type: propertyKey + '-changed', value: newValue, oldValue: oldValue } );

						if ( ! this._changeDispatched ) {

							this._changeDispatched = true;

							requestAnimationFrame( () => {

								this.dispatchEvent( CHANGE_EVENT );
								this._changeDispatched = false;

							} );

						}

					}

				}
			} );

		}

		// Adds animation callback to animation loop.
		startAnimation( callback ) {

			const index = this._animations.findIndex( animation => animation === callback );

			if ( index === - 1 )
				this._animations.push( callback );

			AnimationManagerSingleton.add( callback );

		}

		// Removes animation callback to animation loop.
		stopAnimation( callback ) {

			const index = this._animations.findIndex( animation => animation === callback );

			if ( index !== - 1 )
				this._animations.splice( index, 1 );

			AnimationManagerSingleton.remove( callback );

		}

		// Internal lyfecycle method
		_connect() {

			this.domElement.addEventListener( 'contextmenu', this._onContextMenu, false );
			this.domElement.addEventListener( 'wheel', this._onWheel, { capture: false, passive: false } );
			this.domElement.addEventListener( 'touchdown', this._preventDefault, { capture: false, passive: false } );
			this.domElement.addEventListener( 'touchmove', this._preventDefault, { capture: false, passive: false } );
			this.domElement.addEventListener( 'pointerdown', this._onPointerDown );
			this.domElement.addEventListener( 'pointermove', this._onPointerMove );
			this.domElement.addEventListener( 'pointerleave', this._onPointerLeave, false );
			this.domElement.addEventListener( 'pointercancel', this._onPointerCancel, false );
			this.domElement.addEventListener( 'pointerover', this._onPointerOver, false );
			this.domElement.addEventListener( 'pointerenter', this._onPointerEnter, false );
			this.domElement.addEventListener( 'pointerout', this._onPointerOut, false );
			this.domElement.addEventListener( 'pointerup', this._onPointerUp, false );
			this.domElement.addEventListener( 'keydown', this._onKeyDown, false );
			this.domElement.addEventListener( 'keyup', this._onKeyUp, false );


			// make sure element can receive keys.
			if ( this.domElement.tabIndex === - 1 ) {

				this.domElement.tabIndex = 0;

			}

		}

		// Internal lyfecycle method
		_disconnect() {

			this.domElement.removeEventListener( 'contextmenu', this._onContextMenu, false );
			this.domElement.removeEventListener( 'wheel', this._onWheel );
			this.domElement.removeEventListener( 'touchdown', this._preventDefault );
			this.domElement.removeEventListener( 'touchmove', this._preventDefault );
			this.domElement.removeEventListener( 'pointerdown', this._onPointerDown );
			this.domElement.removeEventListener( 'pointermove', this._onPointerMove );
			this.domElement.removeEventListener( 'pointerleave', this._onPointerLeave, false );
			this.domElement.removeEventListener( 'pointercancel', this._onPointerCancel, false );
			this.domElement.removeEventListener( 'pointerup', this._onPointerUp, false );
			this.domElement.removeEventListener( 'keydown', this._onKeyDown, false );
			this.domElement.removeEventListener( 'keyup', this._onKeyUp, false );


			// Release all captured pointers
			for ( let i = 0; i < this._pointers.length; i ++ ) {

				this.domElement.releasePointerCapture( this._pointers[ i ].pointerId );

			}


			// Stop all animations
			for ( let i = 0; i < this._animations.length; i ++ ) {

				this.stopAnimation( this._animations[ i ] );

			}


			// Clear current pointers and keys
			this._pointers.length = 0;
			this._keys.length = 0;

		}

		// Disables controls and triggers internal _disconnect method to stop animations, diconnects listeners and clears pointer arrays. Dispatches 'dispose' event.
		dispose() {

			this.enabled = false;
			this.dispatchEvent( DISPOSE_EVENT );

		}

		// EventDispatcher.addEventListener with added deprecation warnings.
		addEventListener( type, listener ) {

			if ( type === 'enabled' ) {

				console.warn( `THREE.Controls: "enabled" event is now "enabled-changed"!` );
				type = 'enabled-changed';

			}

			if ( type === 'disabled' ) {

				console.warn( `THREE.Controls: "disabled" event is now "enabled-changed"!` );
				type = 'enabled-changed';

			}

			super.addEventListener( type, listener );

		}

		// EventDispatcher.dispatchEvent with added ability to dispatch native DOM Events.
		dispatchEvent( event ) {

			if ( this._listeners && this._listeners[ event.type ] && this._listeners[ event.type ].length ) {

				Object.defineProperty( event, 'target', { writable: true } );
				super.dispatchEvent( event );

			}

		}

		// Internal event handlers
		_preventDefault( event ) {

			event.preventDefault();

		}
		_onContextMenu( event ) {

			this.dispatchEvent( event );

		}
		_onWheel( event ) {

			this.dispatchEvent( event );

		}
		_onPointerDown( event ) {

			if ( this._simulatedPointer ) {

				this._simulatedPointer.clearMovement();
				this._simulatedPointer = null;
				this.stopAnimation( this._onPointerSimulation );

			}

			this.domElement.focus ? this.domElement.focus() : window.focus();
			this.domElement.setPointerCapture( event.pointerId );
			const pointers = this._pointers;
			const pointer = new PointerTracker( event, this.camera );
			pointer.clearMovement(); // TODO: investigate why this is necessary
			pointers.push( pointer );
			this.onTrackedPointerDown( pointer, pointers );
			this.dispatchEvent( event );

		}
		_onPointerMove( event ) {

			const pointers = this._pointers;
			const index = pointers.findIndex( pointer => pointer.pointerId === event.pointerId );
			let pointer = pointers[ index ];

			if ( pointer ) {

				pointer.update( event, this.camera );
				const x = Math.abs( pointer.view.current.x );
				const y = Math.abs( pointer.view.current.y );


				// Workaround for https://bugs.chromium.org/p/chromium/issues/detail?id=1131348
				if ( pointer.button !== 0 && ( x > 1 || x < 0 || y > 1 || y < 0 ) ) {

					pointers.splice( index, 1 );
					this.domElement.releasePointerCapture( event.pointerId );
					this.dispatchEvent( event );
					this.onTrackedPointerUp( pointer, pointers );
					return;

				}


				/**
                  * TODO: investigate multi-poiter movement accumulation and unhack.
                  * This shouldn't be necessary yet without it, multi pointer gestures result with
                  * multiplied movement values. TODO: investigate and unhack.
                  * */
				for ( let i = 0; i < pointers.length; i ++ ) {

					if ( pointer.pointerId !== pointers[ i ].pointerId ) {

						pointers[ i ].clearMovement(); // TODO: unhack

					}

				}

				this._centerPointer = this._centerPointer || new CenterPointerTracker( event, this.camera );
				this._centerPointer.updateCenter( pointers );

				// TODO: consider throttling once per frame. On Mac pointermove fires up to 120 Hz.
				this.onTrackedPointerMove( pointer, pointers, this._centerPointer );

			} else if ( this._hoverPointer && this._hoverPointer.pointerId === event.pointerId ) {

				pointer = this._hoverPointer;
				pointer.update( event, this.camera );
				this.onTrackedPointerHover( pointer, [ pointer ] );

			} else {

				pointer = this._hoverPointer = new PointerTracker( event, this.camera );
				this.onTrackedPointerHover( pointer, [ pointer ] );

			}


			// Fix MovementX/Y for Safari
			Object.defineProperty( event, 'movementX', { writable: true, value: pointer.canvas.movement.x } );
			Object.defineProperty( event, 'movementY', { writable: true, value: pointer.canvas.movement.y } );
			this.dispatchEvent( event );

		}
		_onPointerSimulation( timeDelta ) {

			if ( this._simulatedPointer ) {

				const pointer = this._simulatedPointer;
				pointer.simmulateDamping( this.dampingFactor, timeDelta );

				if ( pointer.canvas.movement.length() > EPS ) {

					this.onTrackedPointerMove( pointer, [ pointer ], pointer );

				} else {

					this._simulatedPointer = null;
					this.onTrackedPointerUp( pointer, [] );
					this.stopAnimation( this._onPointerSimulation );

				}

			} else {

				this.stopAnimation( this._onPointerSimulation );

			}

		}
		_onPointerUp( event ) {


			// TODO: three-finger drag on Mac touchpad producing delayed pointerup.
			const pointers = this._pointers;
			const index = pointers.findIndex( pointer => pointer.pointerId === event.pointerId );
			const pointer = pointers[ index ];

			if ( pointer ) {

				pointers.splice( index, 1 );
				this.domElement.releasePointerCapture( event.pointerId );

				if ( this.enableDamping ) {

					this._simulatedPointer = pointer;
					this._simulatedPointer.isSimulated = true;
					this.startAnimation( this._onPointerSimulation );

				} else {

					this.onTrackedPointerUp( pointer, pointers );

				}

			}

			this.dispatchEvent( event );

		}
		_onPointerLeave( event ) {

			const pointers = this._pointers;
			const index = pointers.findIndex( pointer => pointer.pointerId === event.pointerId );
			const pointer = pointers[ index ];

			if ( pointer ) {

				pointers.splice( index, 1 );
				this.domElement.releasePointerCapture( event.pointerId );
				this.onTrackedPointerUp( pointer, pointers );

			}

			this.dispatchEvent( event );

		}
		_onPointerCancel( event ) {

			const pointers = this._pointers;
			const index = pointers.findIndex( pointer => pointer.pointerId === event.pointerId );
			const pointer = pointers[ index ];

			if ( pointer ) {

				pointers.splice( index, 1 );
				this.domElement.releasePointerCapture( event.pointerId );
				this.onTrackedPointerUp( pointer, pointers );

			}

			this.dispatchEvent( event );

		}
		_onPointerOver( event ) {

			this.dispatchEvent( event );

		}
		_onPointerEnter( event ) {

			this.dispatchEvent( event );

		}
		_onPointerOut( event ) {

			this.dispatchEvent( event );

		}
		_onKeyDown( event ) {

			const code = Number( event.code );
			const keys = this._keys;
			const index = keys.findIndex( key => key === code );

			if ( index === - 1 )
				keys.push( code );

			if ( ! event.repeat ) {

				this.onTrackedKeyDown( code, keys );
				this.onTrackedKeyChange( code, keys );

			}

			this.dispatchEvent( event );

		}
		_onKeyUp( event ) {

			const code = Number( event.code );
			const keys = this._keys;
			const index = keys.findIndex( key => key === code );

			if ( index !== - 1 )
				keys.splice( index, 1 );

			this.onTrackedKeyUp( code, keys );
			this.onTrackedKeyChange( code, keys );
			this.dispatchEvent( event );

		}

		// Tracked pointer handlers
		/* eslint-disable @typescript-eslint/no-empty-function */
		/* eslint-disable @typescript-eslint/no-unused-vars */
		/* eslint-disable no-unused-vars */
		onTrackedPointerDown( _pointer, _pointers ) { }
		onTrackedPointerMove( _pointer, _pointers, _centerPointer ) { }
		onTrackedPointerHover( _pointer, _pointers ) { }
		onTrackedPointerUp( _pointer, _pointers ) { }
		onTrackedKeyDown( code, codes ) { }
		onTrackedKeyUp( code, codes ) { }
		onTrackedKeyChange( code, codes ) { }

	}

	return MixinClass;

}


/**
 * `Controls`: Generic superclass for interactive viewport controls.
 * `ControlsMixin` applied to `EventDispatcher`.
 */
export class Controls extends ControlsMixin( EventDispatcher ) {

	constructor( camera, domElement ) {

		super( camera, domElement );

	}

}


// Internal utility variables
const _raycaster = new Raycaster();
const _intersectedObjects = [];
const _intersectedPoint = new Vector3();
const _viewMultiplier = new Vector2();
const _viewOffset = new Vector2();
const _plane = new Plane();
const _eye = new Vector3();
const _offsetCameras = new WeakMap();


// Keeps pointer movement data in 2D space
class Pointer2D {

	constructor( x, y ) {

		this.start = new Vector2();
		this.current = new Vector2();
		this.previous = new Vector2();
		this.movement = new Vector2();
		this.offset = new Vector2();
		this.set( x, y );

	}
	set( x, y ) {

		this.start.set( x, y );
		this.current.set( x, y );
		this.previous.set( x, y );
		this.movement.set( 0, 0 );
		this.offset.set( 0, 0 );
		return this;

	}
	clear() {

		this.start.set( 0, 0 );
		this.current.set( 0, 0 );
		this.previous.set( 0, 0 );
		this.movement.set( 0, 0 );
		this.offset.set( 0, 0 );
		return this;

	}
	add( pointer ) {

		this.start.add( pointer.start );
		this.current.add( pointer.current );
		this.previous.add( pointer.previous );
		this.movement.add( pointer.movement );
		this.offset.add( pointer.offset );
		return this;

	}
	copy( pointer ) {

		this.start.copy( pointer.start );
		this.current.copy( pointer.current );
		this.previous.copy( pointer.previous );
		this.movement.copy( pointer.movement );
		this.offset.copy( pointer.offset );
		return this;

	}
	divideScalar( value ) {

		this.start.divideScalar( value );
		this.current.divideScalar( value );
		this.previous.divideScalar( value );
		this.movement.divideScalar( value );
		this.offset.divideScalar( value );
		return this;

	}
	update( x, y ) {

		this.previous.copy( this.current );
		this.current.set( x, y );
		this.movement.copy( this.current ).sub( this.previous );
		this.offset.copy( this.current ).sub( this.start );
		return this;

	}

	// Converts pointer coordinates from "canvas" space ( pixels ) to "view" space ( -1, 1 ).
	convertToViewSpace( domElement ) {

		_viewMultiplier.set( domElement.clientWidth / 2, - 1 * domElement.clientHeight / 2 );
		_viewOffset.set( 1, - 1 );
		this.start.divide( _viewMultiplier ).sub( _viewOffset );
		this.current.divide( _viewMultiplier ).sub( _viewOffset );
		this.previous.divide( _viewMultiplier ).sub( _viewOffset );
		this.movement.divide( _viewMultiplier );
		this.offset.divide( _viewMultiplier );
		return this;

	}

}


// Keeps pointer movement data in 3D space
class Pointer3D {

	constructor( x, y, z ) {


		// TODO: optional grazing fix
		this.start = new Vector3();
		this.current = new Vector3();
		this.previous = new Vector3();
		this.movement = new Vector3();
		this.offset = new Vector3();
		this.set( x, y, z );

	}
	set( x, y, z ) {

		this.start.set( x, y, z );
		this.current.set( x, y, z );
		this.previous.set( x, y, z );
		this.movement.set( 0, 0, 0 );
		this.offset.set( 0, 0, 0 );
		return this;

	}
	clear() {

		this.start.set( 0, 0, 0 );
		this.current.set( 0, 0, 0 );
		this.previous.set( 0, 0, 0 );
		this.movement.set( 0, 0, 0 );
		this.offset.set( 0, 0, 0 );
		return this;

	}
	add( pointer ) {

		this.start.add( pointer.start );
		this.current.add( pointer.current );
		this.previous.add( pointer.previous );
		this.movement.add( pointer.movement );
		this.offset.add( pointer.offset );
		return this;

	}
	divideScalar( value ) {

		this.start.divideScalar( value );
		this.current.divideScalar( value );
		this.previous.divideScalar( value );
		this.movement.divideScalar( value );
		this.offset.divideScalar( value );
		return this;

	}
	projectOnPlane( viewPointer, camera, center, planeNormal, avoidGrazingAngles = true ) {

		_plane.setFromNormalAndCoplanarPoint( planeNormal, center );


		// Avoid projecting onto a plane at grazing angles by projecting from an offset/rotated camera that prevents plane horizon from intersecting the camera fustum.
		if ( avoidGrazingAngles ) {


			// Calculate angle between camera and projection plane and rotation axis.
			_eye.set( 0, 0, 1 ).applyQuaternion( camera.quaternion );
			const angle = HPI - _eye.angleTo( _plane.normal );
			const minAngle = ( ( camera instanceof PerspectiveCamera ) ? ( camera.fov / 1.2 ) : 15 ) / 180 * PI;
			const rotationAxis = _eye.cross( _plane.normal ).normalize();

			// Get rotation center by projecting a ray from the center of the camera frustum into the plane
			_intersectedPoint.set( 0, 0, 0 );
			_raycaster.setFromCamera( new Vector3(), camera );
			_raycaster.ray.intersectPlane( _plane, _intersectedPoint );

			// TODO for orthographic camera shoot ray from far behind the camera center to support gestures beyond frustum.
			const rp = new Vector3().setFromMatrixPosition( camera.matrixWorld ).sub( _intersectedPoint );

			if ( Math.abs( angle ) < minAngle )
				rp.applyAxisAngle( rotationAxis, - angle + ( angle >= 0 ? minAngle : - minAngle ) );

			let virtualCamera = _offsetCameras.get( camera );

			if ( ! virtualCamera )
				_offsetCameras.set( camera, virtualCamera = camera.clone() );

			virtualCamera.copy( camera );
			virtualCamera.position.copy( rp ).add( _intersectedPoint );
			virtualCamera.lookAt( _intersectedPoint );
			virtualCamera.updateMatrixWorld();
			camera = virtualCamera;

		}

		_intersectedPoint.set( 0, 0, 0 );
		_raycaster.setFromCamera( viewPointer.start, camera );
		_raycaster.ray.intersectPlane( _plane, _intersectedPoint );
		this.start.copy( _intersectedPoint );
		_intersectedPoint.set( 0, 0, 0 );
		_raycaster.setFromCamera( viewPointer.current, camera );
		_raycaster.ray.intersectPlane( _plane, _intersectedPoint );
		this.current.copy( _intersectedPoint );
		_intersectedPoint.set( 0, 0, 0 );
		_raycaster.setFromCamera( viewPointer.previous, camera );
		_raycaster.ray.intersectPlane( _plane, _intersectedPoint );
		this.previous.copy( _intersectedPoint );
		this.movement.copy( this.current ).sub( this.previous );
		this.offset.copy( this.current ).sub( this.start );
		return this;

	}

}


/**
 * Keeps track of pointer movements and handles coordinate conversions to various 2D and 3D spaces.
 * It handles pointer raycasting to various 3D planes at camera's target position.
 */
export class PointerTracker {

	constructor( pointerEvent, camera ) {


		// Used to distinguish a special "simulated" pointer used to actuate inertial gestures with damping.
		this.isSimulated = false;

		// 2D pointer with coordinates in canvas-space ( pixels )
		this.canvas = new Pointer2D( 0, 0 );

		// 2D pointer with coordinates in view-space ( [-1...1] range )
		this.view = new Pointer2D( 0, 0 );

		// 3D pointer with coordinates in 3D-space from ray projected onto a plane facing x-axis.
		this._projected = new Pointer3D( 0, 0, 0 );
		this._camera = camera;
		this._pointerEvent = pointerEvent;

		// Set canvas-space pointer from PointerEvent data.
		this.canvas.set( pointerEvent.clientX, pointerEvent.clientY );
		const view = new Pointer2D( 0, 0 );

		Object.defineProperty( this, 'view', {
			get: () => view.copy( this.canvas ).convertToViewSpace( this.domElement )
		} );

	}
	get button() {

		switch ( this._pointerEvent.buttons ) {

			case 1:
				return 0;

			case 2:
				return 2;

			case 4:
				return 1;

			default:
				return - 1;

		}

	}
	get buttons() {

		return this._pointerEvent.buttons;

	}
	get altKey() {

		return this._pointerEvent.altKey;

	}
	get ctrlKey() {

		return this._pointerEvent.ctrlKey;

	}
	get metaKey() {

		return this._pointerEvent.metaKey;

	}
	get shiftKey() {

		return this._pointerEvent.shiftKey;

	}
	get domElement() {

		return this._pointerEvent.target;

	}
	get pointerId() {

		return this._pointerEvent.pointerId;

	}
	get type() {

		return this._pointerEvent.type;

	}

	// Updates the pointer with the lastest pointerEvent and camera.
	update( pointerEvent, camera ) {

		debug: {

			if ( this.pointerId !== pointerEvent.pointerId ) {

				console.error( 'Invalid pointerId!' );
				return;

			}

		}

		this._camera = camera;
		this._pointerEvent = pointerEvent;
		this.canvas.update( pointerEvent.clientX, pointerEvent.clientY );

	}

	// Simmulates inertial movement by applying damping to previous movement. For special **simmulated** pointer only!
	simmulateDamping( dampingFactor, deltaTime ) {

		debug: {

			if ( ! this.isSimulated ) {

				console.error( 'Cannot invoke `simmulateDamping()` on non-simmulated PointerTracker!' );

			}

		}

		if ( ! this.isSimulated )
			return;

		const damping = Math.pow( 1 - dampingFactor, deltaTime * 60 / 1000 );
		this.canvas.update( this.canvas.current.x + this.canvas.movement.x * damping, this.canvas.current.y + this.canvas.movement.y * damping );

	}

	// Projects tracked pointer onto a plane object-space.
	projectOnPlane( planeCenter, planeNormal, avoidGrazingAngles = true ) {

		return this._projected.projectOnPlane( this.view, this._camera, planeCenter, planeNormal, avoidGrazingAngles );

	}

	// Intersects specified objects with **current** view-space pointer vector.
	intersectObjects( objects ) {

		_raycaster.setFromCamera( this.view.current, this._camera );
		_intersectedObjects.length = 0;
		_raycaster.intersectObjects( objects, true, _intersectedObjects );
		return _intersectedObjects;

	}

	// Intersects specified plane with **current** view-space pointer vector.
	intersectPlane( plane ) {

		_raycaster.setFromCamera( this.view.current, this._camera );
		_raycaster.ray.intersectPlane( plane, _intersectedPoint );
		return _intersectedPoint;

	}

	// Clears pointer movement
	clearMovement() {

		this.canvas.previous.copy( this.canvas.current );
		this.canvas.movement.set( 0, 0 );

	}

}


// Virtual "center" pointer tracker for multi-touch gestures.
class CenterPointerTracker extends PointerTracker {

	constructor( pointerEvent, camera ) {

		super( pointerEvent, camera );

		// Array of pointers to calculate centers from
		this._pointers = [];


		// Set center pointer read-only "type" and "pointerId" properties.
		Object.defineProperties( this, {
			type: { value: 'virtual' },
			pointerId: { value: - 1 },
		} );


		// Reusable pointer variables.
		const canvas = new Pointer2D( 0, 0 );
		const view = new Pointer2D( 0, 0 );


		// Getter for center pointer converted to canvas space.
		Object.defineProperty( this, 'canvas', {
			get: () => {

				canvas.clear();
				for ( let i = 0; i < this._pointers.length; i ++ )
					canvas.add( this._pointers[ i ].canvas );

				if ( this._pointers.length > 1 )
					canvas.divideScalar( this._pointers.length );

				return canvas;

			}
		} );


		// Getter for center pointer converted to view space.
		Object.defineProperty( this, 'view', {
			get: () => {

				view.clear();
				for ( let i = 0; i < this._pointers.length; i ++ )
					view.add( this._pointers[ i ].view );

				if ( this._pointers.length > 1 )
					view.divideScalar( this._pointers.length );

				return view;

			}
		} );

	}
	projectOnPlane( planeCenter, planeNormal ) {

		this._projected.clear();
		for ( let i = 0; i < this._pointers.length; i ++ )
			this._projected.add( this._pointers[ i ].projectOnPlane( planeCenter, planeNormal ) );

		if ( this._pointers.length > 1 )
			this._projected.divideScalar( this._pointers.length );

		return this._projected;

	}

	// Updates the internal array of pointers necessary to calculate the centers.
	updateCenter( pointers ) {

		this._pointers = pointers;

	}

}


/**
 * Internal animation manager.
 * It runs requestAnimationFrame loop whenever there are animation callbacks in the internal queue.
 */
class AnimationManager {

	constructor() {

		this._queue = [];
		this._running = false;
		this._time = performance.now();
		this._update = this._update.bind( this );

	}

	// Adds animation callback to the queue
	add( callback ) {

		const index = this._queue.indexOf( callback );

		if ( index === - 1 ) {

			this._queue.push( callback );

			if ( this._queue.length === 1 )
				this._start();

		}

	}

	// Removes animation callback from the queue
	remove( callback ) {

		const index = this._queue.indexOf( callback );

		if ( index !== - 1 ) {

			this._queue.splice( index, 1 );

			if ( this._queue.length === 0 )
				this._stop();

		}

	}

	// Starts animation loop when there are callbacks in the queue
	_start() {

		this._time = performance.now();
		this._running = true;
		requestAnimationFrame( this._update );

	}

	// Stops animation loop when the callbacks queue is empty
	_stop() {

		this._running = false;

	}

	// Invokes all animation callbacks in the queue with timestep (dt)
	_update() {

		if ( this._queue.length === 0 ) {

			this._running = false;
			return;

		}

		if ( this._running )
			requestAnimationFrame( this._update );

		const time = performance.now();
		const timestep = performance.now() - this._time;
		this._time = time;

		for ( let i = 0; i < this._queue.length; i ++ ) {

			this._queue[ i ]( timestep );

		}

	}

}


// Singleton animation manager.
const AnimationManagerSingleton = new AnimationManager();