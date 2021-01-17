import { Vector3, Quaternion, OrthographicCamera, Object3D } from 'three';

export const UNIT = {
	ZERO: Object.freeze( new Vector3( 0, 0, 0 ) ),
	X: Object.freeze( new Vector3( 1, 0, 0 ) ),
	Y: Object.freeze( new Vector3( 0, 1, 0 ) ),
	Z: Object.freeze( new Vector3( 0, 0, 1 ) ),
};


/**
 * `ControlsBase`: Base class for Objects with observable properties, change events and animation.
 */
export class ControlsBase extends Object3D {

	constructor( camera, domElement ) {

		super();
		this.eye = new Vector3();
		this.cameraPosition = new Vector3();
		this.cameraQuaternion = new Quaternion();
		this.cameraScale = new Vector3();
		this.cameraOffset = new Vector3();
		this.worldPosition = new Vector3();
		this.worldQuaternion = new Quaternion();
		this.worldQuaternionInv = new Quaternion();
		this.worldScale = new Vector3();
		this._animations = [];
		this._changeTimeout = null;
		this.camera = camera;
		this.domElement = domElement;
		this.changed = this.changed.bind( this );
		this._debouncedChanged = this._debouncedChanged.bind( this );

	}

	/**
     * Adds property observing mechanism via getter and setter.
     * Also emits '[property]-changed' event and cummulative 'change' event on next rAF.
     */
	observeProperty( propertyKey ) {

		let value = this[ propertyKey ];
		let propChangeCallback = this[ propertyKey + 'Changed' ];

		if ( propChangeCallback )
			propChangeCallback = propChangeCallback.bind( this );

		Object.defineProperty( this, propertyKey, {
			get() {

				return value;

			},
			set( newValue ) {

				const oldValue = value;
				value = newValue;

				if ( newValue !== oldValue ) {

					propChangeCallback && propChangeCallback( newValue, oldValue );
					this.dispatchEvent( { type: propertyKey + '-changed', value: newValue, oldValue: oldValue } );
					this._debouncedChanged();

				}

			}
		} );

	}
	_debouncedChanged() {

		this._changeTimeout = this._changeTimeout || setTimeout( () => {

			this.changed();
			this._changeTimeout = null;

		} );

	}
	changed() { }

	// Adds animation callback to animation loop.
	startAnimation( callback ) {

		const index = this._animations.findIndex( animation => animation === callback );

		if ( index === - 1 )
			this._animations.push( callback );

		AnimationManagerSingleton.add( callback );

	}

	// Removes animation callback from animation loop.
	stopAnimation( callback ) {

		const index = this._animations.findIndex( animation => animation === callback );

		if ( index !== - 1 )
			this._animations.splice( index, 1 );

		AnimationManagerSingleton.remove( callback );

	}

	// Stops all animations.
	stopAllAnimations() {

		for ( let i = 0; i < this._animations.length; i ++ ) {

			this.stopAnimation( this._animations[ i ] );

		}

	}
	dispose() {

		if ( this.parent )
			this.parent.remove( this );

		this.stopAllAnimations();
		this.dispatchEvent( { type: 'dispose' } );

	}
	decomposeMatrices() {

		this.matrixWorld.decompose( this.worldPosition, this.worldQuaternion, this.worldScale );
		this.worldQuaternionInv.copy( this.worldQuaternion ).invert();
		this.camera.updateMatrixWorld();
		this.camera.matrixWorld.decompose( this.cameraPosition, this.cameraQuaternion, this.cameraScale );
		this.cameraOffset.copy( this.cameraPosition ).sub( this.worldPosition );

		if ( this.camera instanceof OrthographicCamera ) {

			this.eye.set( 0, 0, 1 ).applyQuaternion( this.cameraQuaternion );

		} else {

			this.eye.copy( this.cameraOffset ).normalize();

		}

	}
	updateMatrixWorld() {

		super.updateMatrixWorld();
		this.decomposeMatrices();

		// TODO: investigate why is this necessary.
		// Without this, TransformControls needs another update to reorient after "space" change.
		super.updateMatrixWorld();

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