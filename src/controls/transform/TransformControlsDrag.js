/**
 * @author arodic / https://github.com/arodic
 */

import {TransformControlsMixin} from "./TransformControlsMixin.js";
import {TransformHelper} from "../../helpers/transform/TransformHelper.js";

// TODO: Drag Controls should use object as picker and no handle.
export class TransformControlsDrag extends TransformControlsMixin(TransformHelper) {
	constructor(props) {
		super(props);
		this.size = 0.02;
	}
	transform(space) {
		if (space === 'local') {
			this.object.position.copy(this.pointEnd).sub(this.pointStart).applyQuaternion(this.quaternionStart);
		} else {
			this.object.position.copy(this.pointEnd).sub(this.pointStart);
		}
		this.object.position.add(this.positionStart);
	}
}