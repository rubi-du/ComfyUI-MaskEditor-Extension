import { app } from "../../scripts/app.js"

app.registerExtension({
    name: 'Comfy.MaskEditorOverride',
    init(app) {
        const ComfyDialog = app.ui.dialog.constructor;
        const oldcreateButtons = ComfyDialog.prototype.createButtons;
        const useNewEditor = app.extensionManager.setting.get(
            'Comfy.MaskEditor.UseNewEditor'
        );
        if (!useNewEditor) {
            console.warn('Comfy.MaskEditorOverride: Not using old mask editor');
            return;
        }
        ComfyDialog.prototype.createButtons = function(...args) {
            const res = oldcreateButtons.apply(this, args);
            if (this.constructor.name === 'MaskEditorDialog') {
                // eslint-disable-next-line @typescript-eslint/no-this-alias
                const self = this;
                queueMicrotask(() => {
                    this.paths = [];
                    this.messageBroker.createPushTopic('lassoChange')
                    const oldCreateBrushSettings = this.uiManager.createBrushSettings;
                    this.uiManager.createBrushSettings = async function(...args: any[]) {
                        const res = await oldCreateBrushSettings.apply(this, args);
                        const toggle = this.createToggle('Lasso', (event, value) => {
                            this.messageBroker.publish('lassoChange', value)
                        });
                        res.appendChild(toggle);
                        return res;
                    }

                    this.messageBroker.subscribe('lassoChange', (open) => {
                        self.openLasso = open;
                    });

                    const oldHandlePointerDown = this.toolManager.handlePointerDown;
                    this.toolManager.handlePointerDown = function(...args) {
                        const res = oldHandlePointerDown.apply(this, args);
                        self.paths = [];
                        return res;
                    }

                    const oldHandlePointerUp = this.toolManager.handlePointerUp;

                    this.toolManager.handlePointerUp = async function(...args) {
                        const res = oldHandlePointerUp.apply(this, args);
                        // self.paths.push([null]);
                        if (self.paths.length === 0 || !self.openLasso) {
                            return res;
                        }
                        const maskColor = await this.messageBroker.pull('getMaskColor')
                        const maskCtx = this.maskCtx || (await this.messageBroker.pull('maskCtx'));
                        maskCtx.beginPath(); 
                        maskCtx.moveTo(self.paths[0].x, self.paths[0].y);
                        const lastPoint = self.paths[self.paths.length - 1];
                        for (const path of self.paths) {
                            maskCtx.lineTo(path.x, path.y);
                        }
                        maskCtx.closePath();
                        maskCtx.fillStyle = `rgb(${maskColor.r}, ${maskColor.g}, ${maskColor.b})`
                        maskCtx.fill();
                        self.brushTool.drawLine(lastPoint, self.paths[0], 'source-over');
                        return res;
                    }

                    const oldDraw_shap = this.brushTool.draw_shape;

                    this.brushTool.draw_shape = async function(...args) {
                        const point = args[0];
                        const maskCtx = this.maskCtx || (await this.messageBroker.pull('maskCtx'))
                        const isErasing = maskCtx.globalCompositeOperation === 'destination-out'
                        if (!isErasing && self.openLasso) {
                            self.paths.push(point);
                        }
                        const res = await oldDraw_shap.apply(this, args);
                        return res;
                    }
                })
            }
            return res;
        }
    }
})