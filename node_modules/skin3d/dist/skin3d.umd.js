(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('three'), require('skinview-utils'), require('three/examples/jsm/controls/OrbitControls.js'), require('three/examples/jsm/postprocessing/EffectComposer.js'), require('three/examples/jsm/postprocessing/Pass.js'), require('three/examples/jsm/postprocessing/RenderPass.js'), require('three/examples/jsm/postprocessing/ShaderPass.js'), require('three/examples/jsm/shaders/FXAAShader.js')) :
    typeof define === 'function' && define.amd ? define(['exports', 'three', 'skinview-utils', 'three/examples/jsm/controls/OrbitControls.js', 'three/examples/jsm/postprocessing/EffectComposer.js', 'three/examples/jsm/postprocessing/Pass.js', 'three/examples/jsm/postprocessing/RenderPass.js', 'three/examples/jsm/postprocessing/ShaderPass.js', 'three/examples/jsm/shaders/FXAAShader.js'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.skin3d = {}, global.THREE, global.skinviewUtils, global.OrbitControls_js, global.EffectComposer_js, null, global.RenderPass_js, global.ShaderPass_js, global.FXAAShader_js));
})(this, (function (exports, three, skinviewUtils, OrbitControls_js, EffectComposer_js, Pass_js, RenderPass_js, ShaderPass_js, FXAAShader_js) { 'use strict';

    /**
     * @file Model.ts
     * @description This file defines the 3D model classes for Minecraft-style player models, including skin, cape, elytra, and ears.
     * @author Cosmic-fi
     * @license MIT
     */
    /**
     * Set the UV mapping for a box geometry.
     * @param box The box geometry to set UVs for.
     * @param u The U coordinate of the top-left corner of the texture region.
     * @param v The V coordinate of the top-left corner of the texture region.
     * @param width The width of the texture region.
     * @param height The height of the texture region.
     * @param depth The depth of the texture region.
     * @param textureWidth The total width of the texture.
     * @param textureHeight The total height of the texture.
     */
    function setUVs(box, u, v, width, height, depth, textureWidth, textureHeight) {
        const toFaceVertices = (x1, y1, x2, y2) => [
            new three.Vector2(x1 / textureWidth, 1.0 - y2 / textureHeight),
            new three.Vector2(x2 / textureWidth, 1.0 - y2 / textureHeight),
            new three.Vector2(x2 / textureWidth, 1.0 - y1 / textureHeight),
            new three.Vector2(x1 / textureWidth, 1.0 - y1 / textureHeight),
        ];
        const top = toFaceVertices(u + depth, v, u + width + depth, v + depth);
        const bottom = toFaceVertices(u + width + depth, v, u + width * 2 + depth, v + depth);
        const left = toFaceVertices(u, v + depth, u + depth, v + depth + height);
        const front = toFaceVertices(u + depth, v + depth, u + width + depth, v + depth + height);
        const right = toFaceVertices(u + width + depth, v + depth, u + width + depth * 2, v + height + depth);
        const back = toFaceVertices(u + width + depth * 2, v + depth, u + width * 2 + depth * 2, v + height + depth);
        const uvAttr = box.attributes.uv;
        const uvRight = [right[3], right[2], right[0], right[1]];
        const uvLeft = [left[3], left[2], left[0], left[1]];
        const uvTop = [top[3], top[2], top[0], top[1]];
        const uvBottom = [bottom[0], bottom[1], bottom[3], bottom[2]];
        const uvFront = [front[3], front[2], front[0], front[1]];
        const uvBack = [back[3], back[2], back[0], back[1]];
        const newUVData = [];
        for (const uvArray of [uvRight, uvLeft, uvTop, uvBottom, uvFront, uvBack]) {
            for (const uv of uvArray) {
                newUVData.push(uv.x, uv.y);
            }
        }
        uvAttr.set(new Float32Array(newUVData));
        uvAttr.needsUpdate = true;
    }
    /**
     * Set UVs for a skin box (64x64 texture).
     * @param box The box geometry to set UVs for.
     * @param u The U coordinate of the top-left corner of the texture region.
     * @param v The V coordinate of the top-left corner of the texture region.
     * @param width The width of the texture region.
     * @param height The height of the texture region.
     * @param depth The depth of the texture region.
    */
    function setSkinUVs(box, u, v, width, height, depth) {
        setUVs(box, u, v, width, height, depth, 64, 64);
    }
    /** Set UVs for a cape box (64x32 texture).
     * @param box The box geometry to set UVs for.
     * @param u The U coordinate of the top-left corner of the texture region.
     * @param v The V coordinate of the top-left corner of the texture region.
     * @param width The width of the texture region.
     * @param height The height of the texture region.
     * @param depth The depth of the texture region.
    */
    function setCapeUVs(box, u, v, width, height, depth) {
        setUVs(box, u, v, width, height, depth, 64, 32);
    }
    /**
     * Represents a body part with an inner and outer layer.
     * For example, the head with the hat layer.
     */
    class BodyPart extends three.Group {
        constructor(innerLayer, outerLayer) {
            super();
            Object.defineProperty(this, "innerLayer", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: innerLayer
            });
            Object.defineProperty(this, "outerLayer", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: outerLayer
            });
            innerLayer.name = "inner";
            outerLayer.name = "outer";
        }
    }
    /**
     * Represents the player's skin model, including all body parts.
     * Supports "default" and "slim" model types.
     */
    class SkinObject extends three.Group {
        constructor() {
            super();
            Object.defineProperty(this, "head", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "body", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "rightArm", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "leftArm", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "rightLeg", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "leftLeg", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "modelListeners", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: []
            });
            Object.defineProperty(this, "slim", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: false
            });
            Object.defineProperty(this, "_map", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: null
            });
            Object.defineProperty(this, "layer1Material", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "layer1MaterialBiased", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "layer2Material", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "layer2MaterialBiased", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            /**
             * Material for the inner layer (layer 1) of the skin.
             */
            this.layer1Material = new three.MeshStandardMaterial({ side: three.FrontSide });
            this.layer2Material = new three.MeshStandardMaterial({ side: three.DoubleSide, transparent: true, alphaTest: 1e-5 });
            this.layer1MaterialBiased = this.layer1Material.clone();
            this.layer1MaterialBiased.polygonOffset = true;
            this.layer1MaterialBiased.polygonOffsetFactor = 1.0;
            this.layer1MaterialBiased.polygonOffsetUnits = 1.0;
            this.layer2MaterialBiased = this.layer2Material.clone();
            this.layer2MaterialBiased.polygonOffset = true;
            this.layer2MaterialBiased.polygonOffsetFactor = 1.0;
            this.layer2MaterialBiased.polygonOffsetUnits = 1.0;
            /**
             * Head part of the skin model.
             */
            const headBox = new three.BoxGeometry(8, 8, 8);
            setSkinUVs(headBox, 0, 0, 8, 8, 8);
            const headMesh = new three.Mesh(headBox, this.layer1Material);
            const head2Box = new three.BoxGeometry(9, 9, 9);
            setSkinUVs(head2Box, 32, 0, 8, 8, 8);
            const head2Mesh = new three.Mesh(head2Box, this.layer2Material);
            this.head = new BodyPart(headMesh, head2Mesh);
            this.head.name = "head";
            this.head.add(headMesh, head2Mesh);
            headMesh.position.y = 4;
            head2Mesh.position.y = 4;
            this.add(this.head);
            /**
             * Body part of the skin model.
             */
            const bodyBox = new three.BoxGeometry(8, 12, 4);
            setSkinUVs(bodyBox, 16, 16, 8, 12, 4);
            const bodyMesh = new three.Mesh(bodyBox, this.layer1Material);
            const body2Box = new three.BoxGeometry(8.5, 12.5, 4.5);
            setSkinUVs(body2Box, 16, 32, 8, 12, 4);
            const body2Mesh = new three.Mesh(body2Box, this.layer2Material);
            this.body = new BodyPart(bodyMesh, body2Mesh);
            this.body.name = "body";
            this.body.add(bodyMesh, body2Mesh);
            this.body.position.y = -6;
            this.add(this.body);
            /**
             * Right Arm part of the skin model.
             */
            const rightArmBox = new three.BoxGeometry();
            const rightArmMesh = new three.Mesh(rightArmBox, this.layer1MaterialBiased);
            this.modelListeners.push(() => {
                rightArmMesh.scale.x = this.slim ? 3 : 4;
                rightArmMesh.scale.y = 12;
                rightArmMesh.scale.z = 4;
                setSkinUVs(rightArmBox, 40, 16, this.slim ? 3 : 4, 12, 4);
            });
            const rightArm2Box = new three.BoxGeometry();
            const rightArm2Mesh = new three.Mesh(rightArm2Box, this.layer2MaterialBiased);
            this.modelListeners.push(() => {
                rightArm2Mesh.scale.x = this.slim ? 3.5 : 4.5;
                rightArm2Mesh.scale.y = 12.5;
                rightArm2Mesh.scale.z = 4.5;
                setSkinUVs(rightArm2Box, 40, 32, this.slim ? 3 : 4, 12, 4);
            });
            const rightArmPivot = new three.Group();
            rightArmPivot.add(rightArmMesh, rightArm2Mesh);
            this.modelListeners.push(() => {
                rightArmPivot.position.x = this.slim ? -0.5 : -1;
            });
            rightArmPivot.position.y = -4;
            this.rightArm = new BodyPart(rightArmMesh, rightArm2Mesh);
            this.rightArm.name = "rightArm";
            this.rightArm.add(rightArmPivot);
            this.rightArm.position.x = -5;
            this.rightArm.position.y = -2;
            this.add(this.rightArm);
            /**
             * Left Arm part of the skin model.
             */
            const leftArmBox = new three.BoxGeometry();
            const leftArmMesh = new three.Mesh(leftArmBox, this.layer1MaterialBiased);
            this.modelListeners.push(() => {
                leftArmMesh.scale.x = this.slim ? 3 : 4;
                leftArmMesh.scale.y = 12;
                leftArmMesh.scale.z = 4;
                setSkinUVs(leftArmBox, 32, 48, this.slim ? 3 : 4, 12, 4);
            });
            const leftArm2Box = new three.BoxGeometry();
            const leftArm2Mesh = new three.Mesh(leftArm2Box, this.layer2MaterialBiased);
            this.modelListeners.push(() => {
                leftArm2Mesh.scale.x = this.slim ? 3.5 : 4.5;
                leftArm2Mesh.scale.y = 12.5;
                leftArm2Mesh.scale.z = 4.5;
                setSkinUVs(leftArm2Box, 48, 48, this.slim ? 3 : 4, 12, 4);
            });
            const leftArmPivot = new three.Group();
            leftArmPivot.add(leftArmMesh, leftArm2Mesh);
            this.modelListeners.push(() => {
                leftArmPivot.position.x = this.slim ? 0.5 : 1;
            });
            leftArmPivot.position.y = -4;
            this.leftArm = new BodyPart(leftArmMesh, leftArm2Mesh);
            this.leftArm.name = "leftArm";
            this.leftArm.add(leftArmPivot);
            this.leftArm.position.x = 5;
            this.leftArm.position.y = -2;
            this.add(this.leftArm);
            /***
             * Right Leg part of the skin model.
             */
            const rightLegBox = new three.BoxGeometry(4, 12, 4);
            setSkinUVs(rightLegBox, 0, 16, 4, 12, 4);
            const rightLegMesh = new three.Mesh(rightLegBox, this.layer1MaterialBiased);
            const rightLeg2Box = new three.BoxGeometry(4.5, 12.5, 4.5);
            setSkinUVs(rightLeg2Box, 0, 32, 4, 12, 4);
            const rightLeg2Mesh = new three.Mesh(rightLeg2Box, this.layer2MaterialBiased);
            const rightLegPivot = new three.Group();
            rightLegPivot.add(rightLegMesh, rightLeg2Mesh);
            rightLegPivot.position.y = -6;
            this.rightLeg = new BodyPart(rightLegMesh, rightLeg2Mesh);
            this.rightLeg.name = "rightLeg";
            this.rightLeg.add(rightLegPivot);
            this.rightLeg.position.x = -1.9;
            this.rightLeg.position.y = -12;
            this.rightLeg.position.z = -0.1;
            this.add(this.rightLeg);
            /**
             * Left Leg part of the skin model.
             */
            const leftLegBox = new three.BoxGeometry(4, 12, 4);
            setSkinUVs(leftLegBox, 16, 48, 4, 12, 4);
            const leftLegMesh = new three.Mesh(leftLegBox, this.layer1MaterialBiased);
            const leftLeg2Box = new three.BoxGeometry(4.5, 12.5, 4.5);
            setSkinUVs(leftLeg2Box, 0, 48, 4, 12, 4);
            const leftLeg2Mesh = new three.Mesh(leftLeg2Box, this.layer2MaterialBiased);
            const leftLegPivot = new three.Group();
            leftLegPivot.add(leftLegMesh, leftLeg2Mesh);
            leftLegPivot.position.y = -6;
            this.leftLeg = new BodyPart(leftLegMesh, leftLeg2Mesh);
            this.leftLeg.name = "leftLeg";
            this.leftLeg.add(leftLegPivot);
            this.leftLeg.position.x = 1.9;
            this.leftLeg.position.y = -12;
            this.leftLeg.position.z = -0.1;
            this.add(this.leftLeg);
            this.modelType = "default";
        }
        /**
         * The texture map for the skin.
         * @return The texture map for the skin.
        */
        get map() {
            return this._map;
        }
        /**
         * Set the texture map for the skin.
         * @param newMap The new texture map.
         */
        set map(newMap) {
            this._map = newMap;
            this.layer1Material.map = newMap;
            this.layer1Material.needsUpdate = true;
            this.layer1MaterialBiased.map = newMap;
            this.layer1MaterialBiased.needsUpdate = true;
            this.layer2Material.map = newMap;
            this.layer2Material.needsUpdate = true;
            this.layer2MaterialBiased.map = newMap;
            this.layer2MaterialBiased.needsUpdate = true;
        }
        /**
         * The model type ("default" or "slim").
         * @return The model type.
        */
        get modelType() {
            return this.slim ? "slim" : "default";
        }
        /**
         * Set the model type.
         * @param value The new model type.
         */
        set modelType(value) {
            this.slim = value === "slim";
            this.modelListeners.forEach(listener => listener());
        }
        /**
         * Get all body parts in this skin.
         * @return An array of all body parts.
        */
        getBodyParts() {
            return this.children.filter(it => it instanceof BodyPart);
        }
        /**
         * Show or hide the inner layer of all body parts.
         * @param value Whether to show the inner layer.
        */
        setInnerLayerVisible(value) {
            this.getBodyParts().forEach(part => (part.innerLayer.visible = value));
        }
        /**
         * Show or hide the outer layer of all body parts.
         * @param value Whether to show the outer layer.
         */
        setOuterLayerVisible(value) {
            this.getBodyParts().forEach(part => (part.outerLayer.visible = value));
        }
        /**
         * Reset all joint rotations and positions to default.
         */
        resetJoints() {
            this.head.rotation.set(0, 0, 0);
            this.leftArm.rotation.set(0, 0, 0);
            this.rightArm.rotation.set(0, 0, 0);
            this.leftLeg.rotation.set(0, 0, 0);
            this.rightLeg.rotation.set(0, 0, 0);
            this.body.rotation.set(0, 0, 0);
            this.head.position.y = 0;
            this.body.position.y = -6;
            this.body.position.z = 0;
            this.rightArm.position.x = -5;
            this.rightArm.position.y = -2;
            this.rightArm.position.z = 0;
            this.leftArm.position.x = 5;
            this.leftArm.position.y = -2;
            this.leftArm.position.z = 0;
            this.rightLeg.position.x = -1.9;
            this.rightLeg.position.y = -12;
            this.rightLeg.position.z = -0.1;
            this.leftLeg.position.x = 1.9;
            this.leftLeg.position.y = -12;
            this.leftLeg.position.z = -0.1;
        }
    }
    /**
     * Represents a Minecraft-style cape.
     */
    class CapeObject extends three.Group {
        constructor() {
            super();
            Object.defineProperty(this, "cape", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "material", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            this.material = new three.MeshStandardMaterial({
                side: three.DoubleSide,
                transparent: true,
                alphaTest: 1e-5,
            });
            const capeBox = new three.BoxGeometry(10, 16, 1);
            setCapeUVs(capeBox, 0, 0, 10, 16, 1);
            this.cape = new three.Mesh(capeBox, this.material);
            this.cape.position.y = -8;
            this.cape.position.z = 0.5;
            this.add(this.cape);
        }
        /**
         * The texture map for the cape.
         * @return The texture map for the cape.
         */
        get map() {
            return this.material.map;
        }
        /**
         * Set the texture map for the cape.
         * @param newMap The new texture map.
         */
        set map(newMap) {
            this.material.map = newMap;
            this.material.needsUpdate = true;
        }
    }
    /**
     * Represents a Minecraft-style elytra (wings).
     */
    class ElytraObject extends three.Group {
        constructor() {
            super();
            Object.defineProperty(this, "leftWing", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "rightWing", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "material", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            this.material = new three.MeshStandardMaterial({
                side: three.DoubleSide,
                transparent: true,
                alphaTest: 1e-5,
            });
            const leftWingBox = new three.BoxGeometry(12, 22, 4);
            setCapeUVs(leftWingBox, 22, 0, 10, 20, 2);
            const leftWingMesh = new three.Mesh(leftWingBox, this.material);
            leftWingMesh.position.x = -5;
            leftWingMesh.position.y = -10;
            leftWingMesh.position.z = -1;
            this.leftWing = new three.Group();
            this.leftWing.add(leftWingMesh);
            this.add(this.leftWing);
            const rightWingBox = new three.BoxGeometry(12, 22, 4);
            setCapeUVs(rightWingBox, 22, 0, 10, 20, 2);
            const rightWingMesh = new three.Mesh(rightWingBox, this.material);
            rightWingMesh.scale.x = -1;
            rightWingMesh.position.x = 5;
            rightWingMesh.position.y = -10;
            rightWingMesh.position.z = -1;
            this.rightWing = new three.Group();
            this.rightWing.add(rightWingMesh);
            this.add(this.rightWing);
            this.leftWing.position.x = 5;
            this.leftWing.rotation.x = 0.2617994;
            this.resetJoints();
        }
        /**
         * Reset wing rotations to default.
        */
        resetJoints() {
            this.leftWing.rotation.y = 0.01; // avoid z-fighting
            this.leftWing.rotation.z = 0.2617994;
            this.updateRightWing();
        }
        /**
         * Mirror the left wing's position and rotation to the right wing.
         */
        updateRightWing() {
            this.rightWing.position.x = -this.leftWing.position.x;
            this.rightWing.position.y = this.leftWing.position.y;
            this.rightWing.rotation.x = this.leftWing.rotation.x;
            this.rightWing.rotation.y = -this.leftWing.rotation.y;
            this.rightWing.rotation.z = -this.leftWing.rotation.z;
        }
        /**
         * The texture map for the elytra.
         * @return The texture map for the elytra.
         */
        get map() {
            return this.material.map;
        }
        /**
         * Set the texture map for the elytra.
         * @param newMap The new texture map.
         */
        set map(newMap) {
            this.material.map = newMap;
            this.material.needsUpdate = true;
        }
    }
    /**
     * Represents a pair of ears (for skin with ears).
     */
    class EarsObject extends three.Group {
        constructor() {
            super();
            Object.defineProperty(this, "rightEar", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "leftEar", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "material", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            this.material = new three.MeshStandardMaterial({ side: three.FrontSide });
            const earBox = new three.BoxGeometry(8, 8, 4 / 3);
            setUVs(earBox, 0, 0, 6, 6, 1, 14, 7);
            this.rightEar = new three.Mesh(earBox, this.material);
            this.rightEar.name = "rightEar";
            this.rightEar.position.x = -6;
            this.add(this.rightEar);
            this.leftEar = new three.Mesh(earBox, this.material);
            this.leftEar.name = "leftEar";
            this.leftEar.position.x = 6;
            this.add(this.leftEar);
        }
        /**
         * The texture map for the ears.
         * @return The texture map for the ears.
         */
        get map() {
            return this.material.map;
        }
        /**
         * Set the texture map for the ears.
         * @param newMap The new texture map.
         */
        set map(newMap) {
            this.material.map = newMap;
            this.material.needsUpdate = true;
        }
    }
    const CapeDefaultAngle = (10.8 * Math.PI) / 180;
    /**
     * Represents a full player model, including skin, cape, elytra, and ears.
     */
    class PlayerObject extends three.Group {
        constructor() {
            super();
            Object.defineProperty(this, "skin", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "cape", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "elytra", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "ears", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            this.skin = new SkinObject();
            this.skin.name = "skin";
            this.skin.position.y = 8;
            this.add(this.skin);
            this.cape = new CapeObject();
            this.cape.name = "cape";
            this.cape.position.y = 8;
            this.cape.position.z = -2;
            this.cape.rotation.x = CapeDefaultAngle;
            this.cape.rotation.y = Math.PI;
            this.add(this.cape);
            this.elytra = new ElytraObject();
            this.elytra.name = "elytra";
            this.elytra.position.y = 8;
            this.elytra.position.z = -2;
            this.elytra.visible = false;
            this.add(this.elytra);
            this.ears = new EarsObject();
            this.ears.name = "ears";
            this.ears.position.y = 10;
            this.ears.position.z = 2 / 3;
            this.ears.visible = false;
            this.skin.head.add(this.ears);
        }
        /**
         * Which back equipment is visible ("cape", "elytra", or null).
         * @return The currently visible back equipment.
         */
        get backEquipment() {
            if (this.cape.visible)
                return "cape";
            if (this.elytra.visible)
                return "elytra";
            return null;
        }
        /**
         * Set which back equipment is visible.
         * @param value The back equipment to show, or null to hide both.
         */
        set backEquipment(value) {
            this.cape.visible = value === "cape";
            this.elytra.visible = value === "elytra";
        }
        /**
         * Reset all joints and positions to default.
         */
        resetJoints() {
            this.skin.resetJoints();
            this.cape.rotation.x = CapeDefaultAngle;
            this.cape.position.y = 8;
            this.cape.position.z = -2;
            this.elytra.position.y = 8;
            this.elytra.position.z = -2;
            this.elytra.rotation.x = 0;
            this.elytra.resetJoints();
        }
    }

    /**
     * @file Animation.ts
     * @description This file defines the PlayerAnimation class and its subclasses for animating PlayerObject instances.
     * @author Cosmic-fi
     * @license MIT
     */
    /**
     * Abstract base class for animations that can be played on a PlayerObject.
     */
    class PlayerAnimation {
        constructor() {
            /**
             * Animation speed multiplier.
             * @defaultValue 1.0
            */
            Object.defineProperty(this, "speed", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: 1.0
            });
            /**
             * Whether the animation is paused.
             * @defaultValue false
             */
            Object.defineProperty(this, "paused", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: false
            });
            /** Current animation progress. */
            Object.defineProperty(this, "progress", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: 0
            });
            /** Internal id counter for animations. */
            Object.defineProperty(this, "currentId", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: 0
            });
            Object.defineProperty(this, "progress0", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: new Map()
            });
            Object.defineProperty(this, "animationObjects", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: new Map()
            });
        }
        /**
         * Update the animation state.
         * @param player - The player object.
         * @param deltaTime - Time elapsed since last call.
         */
        update(player, deltaTime) {
            if (this.paused)
                return;
            const delta = deltaTime * this.speed;
            this.animate(player, delta);
            this.animationObjects.forEach((animation, id) => {
                const progress0 = this.progress0.get(id);
                animation(player, this.progress - progress0, id);
            });
            this.progress += delta;
        }
        /**
         * Add a new animation function and return its id.
         * @param fn - Animation function (player, progress, id).
         * @returns The id of the newly added animation.
         */
        addAnimation(fn) {
            const id = this.currentId++;
            this.progress0.set(id, this.progress);
            this.animationObjects.set(id, fn);
            return id;
        }
        /**
         * Remove an animation by its id.
         * @param id - The id of the animation to remove.
         */
        removeAnimation(id) {
            if (id !== undefined) {
                this.animationObjects.delete(id);
                this.progress0.delete(id);
            }
        }
    }
    /**
     * Animation from a function.
     */
    class FunctionAnimation extends PlayerAnimation {
        constructor(fn) {
            super();
            Object.defineProperty(this, "fn", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            this.fn = fn;
        }
        /** @inheritdoc */
        animate(player, delta) {
            this.fn(player, this.progress, delta);
        }
    }
    /**
     * Idle animation (arms and cape sway gently).
     */
    class IdleAnimation extends PlayerAnimation {
        /** @inheritdoc */
        animate(player) {
            const t = this.progress * 2;
            const basicArmRotationZ = Math.PI * 0.02;
            player.skin.leftArm.rotation.z = Math.cos(t) * 0.03 + basicArmRotationZ;
            player.skin.rightArm.rotation.z = Math.cos(t + Math.PI) * 0.03 - basicArmRotationZ;
            const basicCapeRotationX = Math.PI * 0.06;
            player.cape.rotation.x = Math.sin(t) * 0.01 + basicCapeRotationX;
        }
    }
    /**
     * Walking animation (arms and legs swing, head bobs).
     */
    class WalkingAnimation extends PlayerAnimation {
        constructor() {
            super(...arguments);
            /**
             * Whether to shake head when walking.
             * @defaultValue true
             */
            Object.defineProperty(this, "headBobbing", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: true
            });
        }
        /** @inheritdoc */
        animate(player) {
            const t = this.progress * 8;
            player.skin.leftLeg.rotation.x = Math.sin(t) * 0.5;
            player.skin.rightLeg.rotation.x = Math.sin(t + Math.PI) * 0.5;
            player.skin.leftArm.rotation.x = Math.sin(t + Math.PI) * 0.5;
            player.skin.rightArm.rotation.x = Math.sin(t) * 0.5;
            const basicArmRotationZ = Math.PI * 0.02;
            player.skin.leftArm.rotation.z = Math.cos(t) * 0.03 + basicArmRotationZ;
            player.skin.rightArm.rotation.z = Math.cos(t + Math.PI) * 0.03 - basicArmRotationZ;
            if (this.headBobbing) {
                player.skin.head.rotation.y = Math.sin(t / 4) * 0.2;
                player.skin.head.rotation.x = Math.sin(t / 5) * 0.1;
            }
            else {
                player.skin.head.rotation.y = 0;
                player.skin.head.rotation.x = 0;
            }
            const basicCapeRotationX = Math.PI * 0.06;
            player.cape.rotation.x = Math.sin(t / 1.5) * 0.06 + basicCapeRotationX;
        }
    }
    /**
     * Running animation (faster, more exaggerated swing).
     */
    class RunningAnimation extends PlayerAnimation {
        /** @inheritdoc */
        animate(player) {
            const t = this.progress * 15 + Math.PI * 0.5;
            player.skin.leftLeg.rotation.x = Math.cos(t + Math.PI) * 1.3;
            player.skin.rightLeg.rotation.x = Math.cos(t) * 1.3;
            player.skin.leftArm.rotation.x = Math.cos(t) * 1.5;
            player.skin.rightArm.rotation.x = Math.cos(t + Math.PI) * 1.5;
            const basicArmRotationZ = Math.PI * 0.1;
            player.skin.leftArm.rotation.z = Math.cos(t) * 0.1 + basicArmRotationZ;
            player.skin.rightArm.rotation.z = Math.cos(t + Math.PI) * 0.1 - basicArmRotationZ;
            player.position.y = Math.cos(t * 2);
            player.position.x = Math.cos(t) * 0.15;
            player.rotation.z = Math.cos(t + Math.PI) * 0.01;
            const basicCapeRotationX = Math.PI * 0.3;
            player.cape.rotation.x = Math.sin(t * 2) * 0.1 + basicCapeRotationX;
        }
    }
    /**
     * Clamps a number between a minimum and maximum value.
     * @param num - The number to clamp.
     * @param min - The minimum value.
     * @param max - The maximum value.
     * @returns The clamped number.
     */
    function clamp(num, min, max) {
        return num <= min ? min : num >= max ? max : num;
    }
    /**
     * Flying animation (body rotates, elytra wings expand).
     */
    class FlyingAnimation extends PlayerAnimation {
        /** @inheritdoc */
        animate(player) {
            const t = this.progress > 0 ? this.progress * 20 : 0;
            const startProgress = clamp((t * t) / 100, 0, 1);
            player.rotation.x = (startProgress * Math.PI) / 2;
            player.skin.head.rotation.x = startProgress > 0.5 ? Math.PI / 4 - player.rotation.x : 0;
            const basicArmRotationZ = Math.PI * 0.25 * startProgress;
            player.skin.leftArm.rotation.z = basicArmRotationZ;
            player.skin.rightArm.rotation.z = -basicArmRotationZ;
            const elytraRotationX = 0.34906584;
            const elytraRotationZ = Math.PI / 2;
            const interpolation = Math.pow(0.9, t);
            player.elytra.leftWing.rotation.x = elytraRotationX + interpolation * (0.2617994 - elytraRotationX);
            player.elytra.leftWing.rotation.z = elytraRotationZ + interpolation * (0.2617994 - elytraRotationZ);
            player.elytra.updateRightWing();
        }
    }
    /**
     * Waving animation (one arm waves).
     */
    class WaveAnimation extends PlayerAnimation {
        constructor(whichArm = "left") {
            super();
            /**
             * Which arm to wave.
             * defaultValue "left"
            */
            Object.defineProperty(this, "whichArm", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            this.whichArm = whichArm;
        }
        /** @inheritdoc */
        animate(player) {
            const t = this.progress * Math.PI;
            const targetArm = this.whichArm === "left" ? player.skin.leftArm : player.skin.rightArm;
            targetArm.rotation.x = 180;
            targetArm.rotation.z = Math.sin(t) * 0.5;
        }
    }
    /**
     * Crouch animation (body and limbs move to crouch pose).
     */
    class CrouchAnimation extends PlayerAnimation {
        constructor() {
            super(...arguments);
            /**
             * Show progress of animation.
             * @defaultValue false
             */
            Object.defineProperty(this, "showProgress", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: false
            });
            /**
             * Run this animation once.
             * @defaultValue false
             */
            Object.defineProperty(this, "runOnce", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: false
            });
            Object.defineProperty(this, "isRunningHitAnimation", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: false
            });
            Object.defineProperty(this, "hitAnimationSpeed", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: 1
            });
            Object.defineProperty(this, "erp", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: 0
            }); // Elytra rotate progress
            Object.defineProperty(this, "isCrouched", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
        }
        /**
         * Add the hit animation.
         * @param speed - Speed of hit animation (default: same as crouch speed).
         */
        addHitAnimation(speed = this.speed) {
            this.isRunningHitAnimation = true;
            this.hitAnimationSpeed = speed;
        }
        /** @inheritdoc */
        animate(player) {
            let pr = this.progress * 8;
            if (pr === 0)
                this.isCrouched = undefined;
            if (this.runOnce)
                pr = clamp(pr, -1, 1);
            if (!this.showProgress)
                pr = Math.floor(pr);
            const sinVal = Math.abs(Math.sin((pr * Math.PI) / 2));
            player.skin.body.rotation.x = 0.4537860552 * sinVal;
            player.skin.body.position.z = 1.3256181 * sinVal - 3.4500310377 * sinVal;
            player.skin.body.position.y = -6 - 2.103677462 * sinVal;
            player.cape.position.y = 8 - 1.851236166577372 * sinVal;
            player.cape.rotation.x = (10.8 * Math.PI) / 180 + 0.294220265771 * sinVal;
            player.cape.position.z = -2 + 3.786619432 * sinVal - 3.4500310377 * sinVal;
            player.elytra.position.x = player.cape.position.x;
            player.elytra.position.y = player.cape.position.y;
            player.elytra.position.z = player.cape.position.z;
            player.elytra.rotation.x = player.cape.rotation.x - (10.8 * Math.PI) / 180;
            const pr1 = this.progress / this.speed;
            if (sinVal === 1) {
                this.erp = !this.isCrouched ? pr1 : this.erp;
                this.isCrouched = true;
                player.elytra.leftWing.rotation.z =
                    0.26179944 + 0.4582006 * Math.abs(Math.sin((Math.min(pr1 - this.erp, 1) * Math.PI) / 2));
                player.elytra.updateRightWing();
            }
            else if (this.isCrouched !== undefined) {
                this.erp = this.isCrouched ? pr1 : this.erp;
                player.elytra.leftWing.rotation.z =
                    0.72 - 0.4582006 * Math.abs(Math.sin((Math.min(pr1 - this.erp, 1) * Math.PI) / 2));
                player.elytra.updateRightWing();
                this.isCrouched = false;
            }
            player.skin.head.position.y = -3.618325234674 * sinVal;
            player.skin.leftArm.position.z = 3.618325234674 * sinVal - 3.4500310377 * sinVal;
            player.skin.rightArm.position.z = player.skin.leftArm.position.z;
            player.skin.leftArm.rotation.x = 0.410367746202 * sinVal;
            player.skin.rightArm.rotation.x = player.skin.leftArm.rotation.x;
            player.skin.leftArm.rotation.z = 0.1;
            player.skin.rightArm.rotation.z = -player.skin.leftArm.rotation.z;
            player.skin.leftArm.position.y = -2 - 2.53943318 * sinVal;
            player.skin.rightArm.position.y = player.skin.leftArm.position.y;
            player.skin.rightLeg.position.z = -3.4500310377 * sinVal;
            player.skin.leftLeg.position.z = player.skin.rightLeg.position.z;
            if (this.isRunningHitAnimation) {
                const pr2 = this.progress;
                let t = (this.progress * 18 * this.hitAnimationSpeed) / this.speed;
                if (this.speed === 0)
                    t = 0;
                const isCrouching = Math.abs(Math.sin((pr2 * Math.PI) / 2)) === 1;
                player.skin.rightArm.rotation.x =
                    -0.4537860552 + 2 * Math.sin(t + Math.PI) * 0.3 - (isCrouching ? 0.4537860552 : 0);
                const basicArmRotationZ = 0.01 * Math.PI + 0.06;
                player.skin.rightArm.rotation.z = -Math.cos(t) * 0.403 + basicArmRotationZ;
                player.skin.body.rotation.y = -Math.cos(t) * 0.06;
                player.skin.leftArm.rotation.x = Math.sin(t + Math.PI) * 0.077 + (isCrouching ? 0.47 : 0);
                player.skin.leftArm.rotation.z = -Math.cos(t) * 0.015 + 0.13 - (!isCrouching ? 0.05 : 0);
                if (!isCrouching) {
                    player.skin.leftArm.position.z = Math.cos(t) * 0.3;
                    player.skin.leftArm.position.x = 5 - Math.cos(t) * 0.05;
                }
            }
        }
    }
    /**
     * Hit animation (right arm swings).
     */
    class HitAnimation extends PlayerAnimation {
        /** @inheritdoc */
        animate(player) {
            const t = this.progress * 18;
            player.skin.rightArm.rotation.x = -0.4537860552 * 2 + 2 * Math.sin(t + Math.PI) * 0.3;
            const basicArmRotationZ = 0.01 * Math.PI + 0.06;
            player.skin.rightArm.rotation.z = -Math.cos(t) * 0.403 + basicArmRotationZ;
            player.skin.body.rotation.y = -Math.cos(t) * 0.06;
            player.skin.leftArm.rotation.x = Math.sin(t + Math.PI) * 0.077;
            player.skin.leftArm.rotation.z = -Math.cos(t) * 0.015 + 0.13 - 0.05;
            player.skin.leftArm.position.z = Math.cos(t) * 0.3;
            player.skin.leftArm.position.x = 5 - Math.cos(t) * 0.05;
        }
    }

    /**
     * @file Nametag.ts
     * @description This file defines the NameTagObject class for creating Minecraft-style name tags.
     * @author Cosmic-fi
     * @license MIT
     */
    /**
     * A Minecraft name tag, i.e. a text label with background.
     */
    class NameTagObject extends three.Sprite {
        constructor(text = "", options = {}) {
            const material = new three.SpriteMaterial({
                transparent: true,
                alphaTest: 1e-5,
            });
            super(material);
            /**
             * A promise that is resolved after the name tag is fully painted.
             *
             * This will be a resolved promise, if
             * {@link NameTagOptions.repaintAfterLoaded} is `false`, or
             * the desired font is available when the `NameTagObject` is created.
             *
             * If {@link NameTagOptions.repaintAfterLoaded} is `true`, and
             * the desired font hasn't been loaded when the `NameTagObject` is created,
             * the name tag will be painted with the fallback font first, and then
             * repainted with the desired font after it's loaded. This promise is
             * resolved after repainting is done.
             */
            Object.defineProperty(this, "painted", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "text", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "font", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "margin", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "textStyle", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "backgroundStyle", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "height", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "textMaterial", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            this.textMaterial = material;
            this.text = text;
            this.font = options.font === undefined ? "48px Minecraft" : options.font;
            this.margin = options.margin === undefined ? [5, 10, 5, 10] : options.margin;
            this.textStyle = options.textStyle === undefined ? "white" : options.textStyle;
            this.backgroundStyle = options.backgroundStyle === undefined ? "rgba(0,0,0,.25)" : options.backgroundStyle;
            this.height = options.height === undefined ? 4.0 : options.height;
            const repaintAfterLoaded = options.repaintAfterLoaded === undefined ? true : options.repaintAfterLoaded;
            if (repaintAfterLoaded && !document.fonts.check(this.font, this.text)) {
                this.paint();
                this.painted = this.loadAndPaint();
            }
            else {
                this.paint();
                this.painted = Promise.resolve();
            }
        }
        /**
         * Set the text of the name tag.
         * @param newText The new text.
         */
        async loadAndPaint() {
            await document.fonts.load(this.font, this.text);
            this.paint();
        }
        /**
         * Paint the name tag.
         * This method creates a canvas, draws the text and background,
         * and applies it as a texture to the sprite.
         * @private
         */
        paint() {
            const canvas = document.createElement("canvas");
            /**
             * Measure the text size
             *
             * @remarks
             * We need to create the canvas and get the context first,
             * because some browsers (e.g., Safari) require a canvas to measure text.
             * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Advanced_text_metrics}
            */
            let ctx = canvas.getContext("2d");
            ctx.font = this.font;
            const metrics = ctx.measureText(this.text);
            /**
             * Resize the canvas to fit the text with margins
             */
            canvas.width = this.margin[3] + metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight + this.margin[1];
            canvas.height =
                this.margin[0] + metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent + this.margin[2];
            /**
             * Draw the background and text
             * @remarks
             * We need to get the context again after resizing the canvas,
             * because resizing clears the canvas and resets the context.
             * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas#resizing_the_canvas
             */
            ctx = canvas.getContext("2d");
            ctx.font = this.font;
            /**
             * Draw the background
             */
            ctx.fillStyle = this.backgroundStyle;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            /**
             * Draw the text
             */
            ctx.fillStyle = this.textStyle;
            ctx.fillText(this.text, this.margin[3] + metrics.actualBoundingBoxLeft, this.margin[0] + metrics.actualBoundingBoxAscent);
            /**
             * Create the texture and apply it to the sprite
             */
            const texture = new three.CanvasTexture(canvas);
            texture.magFilter = three.NearestFilter;
            texture.minFilter = three.NearestFilter;
            this.textMaterial.map = texture;
            this.textMaterial.needsUpdate = true;
            /**
             * Adjust the scale of the sprite to maintain aspect ratio
             */
            this.scale.x = (canvas.width / canvas.height) * this.height;
            this.scale.y = this.height;
        }
    }

    /**
     * @file Render.ts
     * @description This file defines the Render class that renders a 3D player model on a canvas.
     * @author Cosmic-fi
     * @license MIT
     */
    /**
     * The {Render} renders the player on a canvas.
     */
    class Render {
        constructor(options = {}) {
            /** The canvas where the renderer draws its output. */
            Object.defineProperty(this, "canvas", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "scene", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "camera", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "renderer", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            /** Mouse control component (OrbitControls). */
            Object.defineProperty(this, "controls", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            /** The player object (skin, cape, elytra, ears). */
            Object.defineProperty(this, "playerObject", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            /** Group that wraps the player object for centering. */
            Object.defineProperty(this, "playerWrapper", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "globalLight", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: new three.AmbientLight(0xffffff, 3)
            });
            Object.defineProperty(this, "cameraLight", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: new three.PointLight(0xffffff, 0.6)
            });
            Object.defineProperty(this, "composer", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "renderPass", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "fxaaPass", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "skinCanvas", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "capeCanvas", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "earsCanvas", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "skinTexture", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: null
            });
            Object.defineProperty(this, "capeTexture", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: null
            });
            Object.defineProperty(this, "earsTexture", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: null
            });
            Object.defineProperty(this, "backgroundTexture", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: null
            });
            Object.defineProperty(this, "_disposed", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: false
            });
            Object.defineProperty(this, "_renderPaused", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: false
            });
            Object.defineProperty(this, "_zoom", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "isUserRotating", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: false
            });
            /**
             * Whether to rotate the player along the y axis.
             *
             * @defaultValue `false`
             */
            Object.defineProperty(this, "autoRotate", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: false
            });
            /**
             * The angular velocity of the player, in rad/s.
             *
             * @defaultValue `1.0`
             * @see {@link autoRotate}
             */
            Object.defineProperty(this, "autoRotateSpeed", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: 1.0
            });
            Object.defineProperty(this, "_animation", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "clock", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "animationID", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "onContextLost", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "onContextRestored", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "_pixelRatio", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "devicePixelRatioQuery", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "onDevicePixelRatioChange", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: void 0
            });
            Object.defineProperty(this, "_nameTag", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: null
            });
            this.canvas = options.canvas ?? document.createElement("canvas");
            this.skinCanvas = document.createElement("canvas");
            this.capeCanvas = document.createElement("canvas");
            this.earsCanvas = document.createElement("canvas");
            this.scene = new three.Scene();
            this.camera = new three.PerspectiveCamera();
            this.camera.add(this.cameraLight);
            this.scene.add(this.camera, this.globalLight);
            three.ColorManagement.enabled = false;
            this.renderer = new three.WebGLRenderer({
                canvas: this.canvas,
                preserveDrawingBuffer: options.preserveDrawingBuffer === true,
            });
            this.onDevicePixelRatioChange = () => {
                this.renderer.setPixelRatio(window.devicePixelRatio);
                this.updateComposerSize();
                if (this._pixelRatio === "match-device") {
                    this.devicePixelRatioQuery = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
                    this.devicePixelRatioQuery.addEventListener("change", this.onDevicePixelRatioChange, { once: true });
                }
            };
            if (options.pixelRatio === undefined || options.pixelRatio === "match-device") {
                this._pixelRatio = "match-device";
                this.devicePixelRatioQuery = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
                this.devicePixelRatioQuery.addEventListener("change", this.onDevicePixelRatioChange, { once: true });
                this.renderer.setPixelRatio(window.devicePixelRatio);
            }
            else {
                this._pixelRatio = options.pixelRatio;
                this.devicePixelRatioQuery = null;
                this.renderer.setPixelRatio(options.pixelRatio);
            }
            this.renderer.setClearColor(0, 0);
            let renderTarget;
            if (this.renderer.capabilities.isWebGL2) {
                renderTarget = new three.WebGLRenderTarget(0, 0, {
                    depthTexture: new three.DepthTexture(0, 0, three.FloatType),
                });
            }
            this.composer = new EffectComposer_js.EffectComposer(this.renderer, renderTarget);
            this.renderPass = new RenderPass_js.RenderPass(this.scene, this.camera);
            this.fxaaPass = new ShaderPass_js.ShaderPass(FXAAShader_js.FXAAShader);
            this.composer.addPass(this.renderPass);
            this.composer.addPass(this.fxaaPass);
            this.playerObject = new PlayerObject();
            this.playerObject.name = "player";
            this.playerObject.skin.visible = false;
            this.playerObject.cape.visible = false;
            this.playerWrapper = new three.Group();
            this.playerWrapper.add(this.playerObject);
            this.scene.add(this.playerWrapper);
            this.controls = new OrbitControls_js.OrbitControls(this.camera, this.canvas);
            this.controls.enableRotate = options.enableRotation !== false;
            this.controls.enableZoom = options.allowZoom !== false;
            if (options.skin !== undefined) {
                this.loadSkin(options.skin, {
                    model: options.model,
                    ears: options.ears === "current-skin",
                });
            }
            if (options.cape !== undefined)
                this.loadCape(options.cape);
            if (options.ears !== undefined && options.ears !== "current-skin") {
                this.loadEars(options.ears.source, { textureType: options.ears.textureType });
            }
            if (options.width !== undefined)
                this.width = options.width;
            if (options.height !== undefined)
                this.height = options.height;
            if (options.background !== undefined)
                this.background = options.background;
            if (options.panorama !== undefined)
                this.loadPanorama(options.panorama);
            if (options.nameTag !== undefined)
                this.nameTag = options.nameTag;
            this.camera.position.z = 1;
            this._zoom = options.zoom ?? 0.9;
            this.fov = options.fov ?? 50;
            this._animation = options.animation ?? null;
            this.clock = new three.Clock();
            if (options.renderPaused === true) {
                this._renderPaused = true;
                this.animationID = null;
            }
            else {
                this.animationID = window.requestAnimationFrame(() => this.draw());
            }
            this.onContextLost = (event) => {
                event.preventDefault();
                if (this.animationID !== null) {
                    window.cancelAnimationFrame(this.animationID);
                    this.animationID = null;
                }
            };
            this.onContextRestored = () => {
                this.renderer.setClearColor(0, 0);
                if (!this._renderPaused && !this._disposed && this.animationID === null) {
                    this.animationID = window.requestAnimationFrame(() => this.draw());
                }
            };
            this.canvas.addEventListener("webglcontextlost", this.onContextLost, false);
            this.canvas.addEventListener("webglcontextrestored", this.onContextRestored, false);
            this.canvas.addEventListener("mousedown", () => {
                this.isUserRotating = true;
            }, false);
            this.canvas.addEventListener("mouseup", () => {
                this.isUserRotating = false;
            }, false);
            this.canvas.addEventListener("touchmove", e => {
                this.isUserRotating = e.touches.length === 1;
            }, false);
            this.canvas.addEventListener("touchend", () => {
                this.isUserRotating = false;
            }, false);
        }
        /**
         * Update the size and pixel ratio of the composer and FXAA pass.
         * Called internally when the renderer size or pixel ratio changes.
         * @internal
         */
        updateComposerSize() {
            this.composer.setSize(this.width, this.height);
            const pixelRatio = this.renderer.getPixelRatio();
            this.composer.setPixelRatio(pixelRatio);
            this.fxaaPass.material.uniforms["resolution"].value.x = 1 / (this.width * pixelRatio);
            this.fxaaPass.material.uniforms["resolution"].value.y = 1 / (this.height * pixelRatio);
        }
        /**
         * Create or update the skin texture from the skin canvas.
         * Called internally after loading a new skin.
         * @internal
         */
        recreateSkinTexture() {
            this.skinTexture?.dispose();
            this.skinTexture = new three.CanvasTexture(this.skinCanvas);
            this.skinTexture.magFilter = three.NearestFilter;
            this.skinTexture.minFilter = three.NearestFilter;
            this.playerObject.skin.map = this.skinTexture;
        }
        /**
         * Create or update the cape texture from the cape canvas.
         * @internal
        */
        recreateCapeTexture() {
            this.capeTexture?.dispose();
            this.capeTexture = new three.CanvasTexture(this.capeCanvas);
            this.capeTexture.magFilter = three.NearestFilter;
            this.capeTexture.minFilter = three.NearestFilter;
            this.playerObject.cape.map = this.capeTexture;
            this.playerObject.elytra.map = this.capeTexture;
        }
        /**
         * Create or update the ears texture from the ears canvas.
         * @internal
         */
        recreateEarsTexture() {
            this.earsTexture?.dispose();
            this.earsTexture = new three.CanvasTexture(this.earsCanvas);
            this.earsTexture.magFilter = three.NearestFilter;
            this.earsTexture.minFilter = three.NearestFilter;
            this.playerObject.ears.map = this.earsTexture;
        }
        loadSkin(source, options = {}) {
            if (source === null) {
                this.resetSkin();
            }
            else if (skinviewUtils.isTextureSource(source)) {
                skinviewUtils.loadSkinToCanvas(this.skinCanvas, source);
                this.recreateSkinTexture();
                this.playerObject.skin.modelType =
                    options.model === undefined || options.model === "auto-detect"
                        ? skinviewUtils.inferModelType(this.skinCanvas)
                        : options.model;
                if (options.makeVisible !== false)
                    this.playerObject.skin.visible = true;
                if (options.ears === true || options.ears === "load-only") {
                    skinviewUtils.loadEarsToCanvasFromSkin(this.earsCanvas, source);
                    this.recreateEarsTexture();
                    if (options.ears === true)
                        this.playerObject.ears.visible = true;
                }
            }
            else {
                return skinviewUtils.loadImage(source).then(image => this.loadSkin(image, options));
            }
        }
        /**
        *  Hide and dispose the current skin texture.
        */
        resetSkin() {
            this.playerObject.skin.visible = false;
            this.playerObject.skin.map = null;
            this.skinTexture?.dispose();
            this.skinTexture = null;
        }
        loadCape(source, options = {}) {
            if (source === null) {
                this.resetCape();
            }
            else if (skinviewUtils.isTextureSource(source)) {
                skinviewUtils.loadCapeToCanvas(this.capeCanvas, source);
                this.recreateCapeTexture();
                if (options.makeVisible !== false) {
                    this.playerObject.backEquipment = options.backEquipment ?? "cape";
                }
            }
            else {
                return skinviewUtils.loadImage(source).then(image => this.loadCape(image, options));
            }
        }
        /** Hide and dispose the current cape texture. */
        resetCape() {
            this.playerObject.backEquipment = null;
            this.playerObject.cape.map = null;
            this.playerObject.elytra.map = null;
            this.capeTexture?.dispose();
            this.capeTexture = null;
        }
        loadEars(source, options = {}) {
            if (source === null) {
                this.resetEars();
            }
            else if (skinviewUtils.isTextureSource(source)) {
                if (options.textureType === "skin") {
                    skinviewUtils.loadEarsToCanvasFromSkin(this.earsCanvas, source);
                }
                else {
                    skinviewUtils.loadEarsToCanvas(this.earsCanvas, source);
                }
                this.recreateEarsTexture();
                if (options.makeVisible !== false)
                    this.playerObject.ears.visible = true;
            }
            else {
                return skinviewUtils.loadImage(source).then(image => this.loadEars(image, options));
            }
        }
        /**
         * Hide and dispose the current ears texture.
         */
        resetEars() {
            this.playerObject.ears.visible = false;
            this.playerObject.ears.map = null;
            this.earsTexture?.dispose();
            this.earsTexture = null;
        }
        /**
         * Load a panorama background.
         * @param source - The panorama image or canvas.
         */
        loadPanorama(source) {
            return this.loadBackground(source, three.EquirectangularReflectionMapping);
        }
        loadBackground(source, mapping) {
            if (skinviewUtils.isTextureSource(source)) {
                this.backgroundTexture?.dispose();
                this.backgroundTexture = new three.Texture();
                this.backgroundTexture.image = source;
                if (mapping)
                    this.backgroundTexture.mapping = mapping;
                this.backgroundTexture.needsUpdate = true;
                this.scene.background = this.backgroundTexture;
            }
            else {
                return skinviewUtils.loadImage(source).then(image => this.loadBackground(image, mapping));
            }
        }
        /**
         * Animation and rendering loop.
         * @internal
         */
        draw() {
            const dt = this.clock.getDelta();
            this._animation?.update(this.playerObject, dt);
            if (this.autoRotate && !(this.controls.enableRotate && this.isUserRotating)) {
                this.playerWrapper.rotation.y += dt * this.autoRotateSpeed;
            }
            this.controls.update();
            this.render();
            this.animationID = window.requestAnimationFrame(() => this.draw());
        }
        /**
         * Render the scene to the canvas (does not advance animation).
        */
        render() {
            this.composer.render();
        }
        /**
         * Set the render size in pixels.
         */
        setSize(width, height) {
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(width, height);
            this.updateComposerSize();
        }
        /**
         * Dispose all resources and event listeners.
         */
        dispose() {
            this._disposed = true;
            this.canvas.removeEventListener("webglcontextlost", this.onContextLost, false);
            this.canvas.removeEventListener("webglcontextrestored", this.onContextRestored, false);
            this.devicePixelRatioQuery?.removeEventListener("change", this.onDevicePixelRatioChange);
            this.devicePixelRatioQuery = null;
            if (this.animationID !== null) {
                window.cancelAnimationFrame(this.animationID);
                this.animationID = null;
            }
            this.controls.dispose();
            this.renderer.dispose();
            this.resetSkin();
            this.resetCape();
            this.resetEars();
            this.background = null;
            this.fxaaPass.fsQuad.dispose();
        }
        get disposed() {
            return this._disposed;
        }
        /**
         * Whether rendering and animations are paused.
         */
        get renderPaused() {
            return this._renderPaused;
        }
        set renderPaused(value) {
            this._renderPaused = value;
            if (value && this.animationID !== null) {
                window.cancelAnimationFrame(this.animationID);
                this.animationID = null;
                this.clock.stop();
                this.clock.autoStart = true;
            }
            else if (!value && !this._disposed && !this.renderer.getContext().isContextLost() && this.animationID == null) {
                this.animationID = window.requestAnimationFrame(() => this.draw());
            }
        }
        get width() {
            return this.renderer.getSize(new three.Vector2()).width;
        }
        set width(newWidth) {
            this.setSize(newWidth, this.height);
        }
        get height() {
            return this.renderer.getSize(new three.Vector2()).height;
        }
        set height(newHeight) {
            this.setSize(this.width, newHeight);
        }
        get background() {
            return this.scene.background;
        }
        set background(value) {
            if (value === null || value instanceof three.Color || value instanceof three.Texture) {
                this.scene.background = value;
            }
            else {
                this.scene.background = new three.Color(value);
            }
            if (this.backgroundTexture !== null && value !== this.backgroundTexture) {
                this.backgroundTexture.dispose();
                this.backgroundTexture = null;
            }
        }
        /**
         * Adjust camera distance based on FOV and zoom.
         */
        adjustCameraDistance() {
            let distance = 4.5 + 16.5 / Math.tan(((this.fov / 180) * Math.PI) / 2) / this.zoom;
            distance = Math.max(10, Math.min(distance, 256));
            this.camera.position.multiplyScalar(distance / this.camera.position.length());
            this.camera.updateProjectionMatrix();
        }
        /**
         * Reset camera to default pose and distance.
         */
        resetCameraPose() {
            this.camera.position.set(0, 0, 1);
            this.camera.rotation.set(0, 0, 0);
            this.adjustCameraDistance();
        }
        get fov() {
            return this.camera.fov;
        }
        set fov(value) {
            this.camera.fov = value;
            this.adjustCameraDistance();
        }
        get zoom() {
            return this._zoom;
        }
        set zoom(value) {
            this._zoom = value;
            this.adjustCameraDistance();
        }
        get pixelRatio() {
            return this._pixelRatio;
        }
        set pixelRatio(newValue) {
            if (newValue === "match-device") {
                if (this._pixelRatio !== "match-device") {
                    this._pixelRatio = newValue;
                    this.onDevicePixelRatioChange();
                }
            }
            else {
                if (this._pixelRatio === "match-device" && this.devicePixelRatioQuery !== null) {
                    this.devicePixelRatioQuery.removeEventListener("change", this.onDevicePixelRatioChange);
                    this.devicePixelRatioQuery = null;
                }
                this._pixelRatio = newValue;
                this.renderer.setPixelRatio(newValue);
                this.updateComposerSize();
            }
        }
        /**
         * The animation that is currently playing, or `null` if no animation is playing.
         * Setting this property to a different value will change the current animation.
         * The player's pose and the progress of the new animation will be reset before playing.
         * Setting this property to `null` will stop the current animation and reset the player's pose.
         */
        get animation() {
            return this._animation;
        }
        set animation(animation) {
            if (this._animation !== animation) {
                this.playerObject.resetJoints();
                this.playerObject.position.set(0, 0, 0);
                this.playerObject.rotation.set(0, 0, 0);
                this.clock.stop();
                this.clock.autoStart = true;
            }
            if (animation !== null)
                animation.progress = 0;
            this._animation = animation;
        }
        /**
         * The name tag to display above the player, or `null` if there is none.
         * When setting this property to a `string` value, a {@link NameTagObject}
         * will be automatically created with default options.
         *
         * @example
         * Render.nameTag = "Norch";
         * Render.nameTag = new NameTagObject("hello", { textStyle: "yellow" });
         * Render.nameTag = null;
         */
        get nameTag() {
            return this._nameTag;
        }
        set nameTag(newVal) {
            if (this._nameTag !== null)
                this.playerWrapper.remove(this._nameTag);
            if (newVal === null) {
                this._nameTag = null;
                return;
            }
            if (!(newVal instanceof three.Object3D))
                newVal = new NameTagObject(newVal);
            this.playerWrapper.add(newVal);
            newVal.position.y = 20;
            this._nameTag = newVal;
        }
        /**
         * Reset the model's rotation to default.
         */
        resetModelRotation() {
            this.playerWrapper.rotation.set(0, 0, 0);
            this.controls.reset();
        }
    }

    exports.BodyPart = BodyPart;
    exports.CapeObject = CapeObject;
    exports.CrouchAnimation = CrouchAnimation;
    exports.EarsObject = EarsObject;
    exports.ElytraObject = ElytraObject;
    exports.FlyingAnimation = FlyingAnimation;
    exports.FunctionAnimation = FunctionAnimation;
    exports.HitAnimation = HitAnimation;
    exports.IdleAnimation = IdleAnimation;
    exports.NameTagObject = NameTagObject;
    exports.PlayerAnimation = PlayerAnimation;
    exports.PlayerObject = PlayerObject;
    exports.Render = Render;
    exports.RunningAnimation = RunningAnimation;
    exports.SkinObject = SkinObject;
    exports.WalkingAnimation = WalkingAnimation;
    exports.WaveAnimation = WaveAnimation;

}));
