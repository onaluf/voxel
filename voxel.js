/*
 * javascript voxel demo 
 *
 * Copyright (c) 2009 Selim Arsever (voxel.onaluf.org)
 * licensed under the MIT (MIT-LICENSE.txt)
 */
var voxel = (function() {
    // local variables:
    var texture, heightmap, offscreenCanvas, offscreenContext, onscreenCanvas, onscreenContext, frame, startTime, frameCounter;
    
    var constants = {
        highres: false,
        screen: {
            height:    100,
            width:     160,
            zoom:      4
        },
        
        pov: {
            verticalOpening:   0.4,
            depthOfField:     900
        },
        
        color: {
            fog: [216, 247, 255]
        },
        
        init: function() {
            constants.pov.horizontalOpening = Math.atan(constants.pov.verticalOpening) * constants.screen.width / constants.screen.height;
            constants.screen.distance       = constants.screen.width / 2 / Math.tan(constants.pov.horizontalOpening);
        }
    };
    
    //you app's private functions comme here
    var imageToImageData = function (image){
        // draw the image to to the canvas
        var canvas        = document.createElement('canvas');
        canvas.width      = image.width;
        canvas.height     = image.height;
        
        var context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        
        // return the imageData
        return context.getImageData(0, 0, image.width, image.height);
    };
    
    var imageDataToArrayR = function (imageData) {
        // create an exportable array instead of the data part
        // but with only the red component
        var temp = {
            width:  imageData.width,
            height: imageData.height,
            data:   []
        };
        for(var i = 0; i < imageData.data.length / 4; i++) {
            temp.data[i] = imageData.data[i*4];
        }
        return temp;
    };
    
    var imageDataToArray = function (imageData) {
        // create an exportable array instead of the data part
        var temp = {
            width:  imageData.width,
            height: imageData.height,
            data:   []
        };
        for(var i = 0; i < imageData.data.length; i++) {
            temp.data[i] = imageData.data[i];
        }
        return temp;
    };
    
    var position = {
            x: 450, 
            y: 0, 
            z: 180,
            a: Math.PI/2,
            antialiasing: false
        };
        
    frameCounter = 0;
        
    var loadHeightmap = function(heighmapFilename, textureFilename) {
            var img    = new Image();
            img.onload = function() {
                    // convert the image to an ImageData
                    var imageData = imageToImageData(img);
                    // convert the imageData to an array
                    heightmap = imageDataToArrayR(imageData);
                    // Load the texture
                    loadTexture(textureFilename);
                };
            img.src = heighmapFilename;
        };
        
    var loadTexture = function(textureFilename) {
            var img    = new Image();
            img.onload = function() {
                    // draw the image to to the canvas
                    var imageData = imageToImageData(img);
                    // convert the imageData to an array
                    texture = imageDataToArray(imageData);
                    // now we can continue 
                    imagesLoaded();
                };
            img.src = textureFilename;
        };
        
    var imagesLoaded = function() {
            // initialize constants:
            constants.init();
            
            // create a sort of double buffer (two context):
            // first a offscreen context
            offscreenCanvas        = document.createElement('canvas');
            offscreenCanvas.width  = constants.screen.width;
            offscreenCanvas.height = constants.screen.height;
            offscreenContext       = offscreenCanvas.getContext("2d");        
            
            // second the onscreen context
            onscreenCanvas         = document.getElementById("canvas");
            onscreenCanvas.width   = constants.screen.width  * constants.screen.zoom;
            onscreenCanvas.height  = constants.screen.height * constants.screen.zoom;
            onscreenContext        = onscreenCanvas.getContext("2d");
            
            // get an ImageData to draw each frame
            frame = offscreenContext.getImageData(0, 0, constants.screen.width, constants.screen.height);
            
            // send all important data to the worker:
            startTime = new Date().getTime();
            renderFrame();
        };
        
    var renderFrame = function() {
            // Clean the frame to the sky color
            offscreenContext.fillStyle = "rgb("+constants.color.fog[0]+","+constants.color.fog[1]+","+constants.color.fog[2]+")";
            offscreenContext.fillRect(0, 0, constants.screen.width, constants.screen.height);
            frame = offscreenContext.getImageData(0, 0, constants.screen.width, constants.screen.height);
            var image = frame.data;
            
            var doff               = constants.pov.depthOfField / 4;
            var c1                 = constants.screen.height /2;
            var c2                 = constants.screen.distance * position.z;
            
            for (var i = 0; i < constants.screen.width; i++){
                var orientation        = position.a - constants.pov.horizontalOpening*(1-i*2/constants.screen.width);
                var progression        = {x: Math.cos(orientation), y: Math.sin(orientation)};
                
                var distanceProbed     = 0;
                var screenProjectedTop = 0;
                var oldHeight          = 0;
                var oldRenderCache     = false;
                var summit             = false;
                
                while(distanceProbed < constants.pov.depthOfField && screenProjectedTop < constants.screen.height) {
                    // 1) find the projection of the current point on the screen space
                    distanceProbed  +=  (distanceProbed < doff)? 2 : (distanceProbed < 2 * doff)? 4 : (distanceProbed < 3 * doff)? 8 : 16;
                    var probe = { //warp for texture
                            x: Math.abs(Math.ceil(position.x + distanceProbed * progression.x)),
                            y: Math.abs(Math.ceil(position.y + distanceProbed * progression.y))
                        };
                    var dataIndex        = heightmap.width * (probe.y % heightmap.height) + (probe.x % heightmap.width);
                    
                    // This is a small optimisation to skip some projection computation
                    var height           = heightmap.data[dataIndex];  
                    if(height < oldHeight){
                        oldHeight = height;
                        continue;
                    }
                    oldHeight = height;
                    
                    var projectedHeight  = Math.min(Math.ceil(c1 - (c2 - constants.screen.distance*height) / distanceProbed), constants.screen.height);
                    
                    // 2) if visible we draw it
                    if (projectedHeight > screenProjectedTop) {
                        var textureDataIndex = (texture.width * (probe.y % texture.height) + (probe.x % texture.width)) * 4;
                        var textureCache     = [texture.data[textureDataIndex], texture.data[textureDataIndex + 1], texture.data[textureDataIndex + 2]];
                        
                        var fillGoal     = Math.max(constants.screen.height-projectedHeight, 0);
                        var fogFactor    = Math.min(distanceProbed, constants.pov.depthOfField)/constants.pov.depthOfField;
                        var invFogFactor = (1 - fogFactor);
                        
                        // antialiasing
                        var renderCache = {
                                r: invFogFactor * textureCache[0] + fogFactor * constants.color.fog[0], 
                                g: invFogFactor * textureCache[1] + fogFactor * constants.color.fog[1], 
                                b: invFogFactor * textureCache[2] + fogFactor * constants.color.fog[2]
                            };
                        if(position.antialiasing && oldRenderCache && summit) {
                            var previousIndex = (i + constants.screen.width * (constants.screen.height-screenProjectedTop+1))*4;
                            image[previousIndex]   = Math.ceil(0.5*renderCache.r + 0.5*oldRenderCache.r);
                            image[previousIndex+1] = Math.ceil(0.5*renderCache.g + 0.5*oldRenderCache.g);
                            image[previousIndex+2] = Math.ceil(0.5*renderCache.b + 0.5*oldRenderCache.b);
                        }
                        oldRenderCache = renderCache;
                        
                        // render
                        for (var j = (constants.screen.height - screenProjectedTop); j > fillGoal; j--) {
                            image[(i+j*constants.screen.width)*4]   = Math.ceil(renderCache.r);
                            image[(i+j*constants.screen.width)*4+1] = Math.ceil(renderCache.g);
                            image[(i+j*constants.screen.width)*4+2] = Math.ceil(renderCache.b);
                            image[(i+j*constants.screen.width)*4+3] = 255;
                        }
                        screenProjectedTop = projectedHeight;
                        summit = false;
                    } else if (screenProjectedTop > projectedHeight){
                        summit = true;
                    }
                }
                
                // 3) if the top is lower than the top of the screen we fill it
                if(position.antialiasing){
                    if((constants.screen.height - screenProjectedTop + 1) >= 0) {
                        var j = (i + (constants.screen.height - screenProjectedTop + 1 ) * constants.screen.width)*4;
                        image[j]   = Math.ceil(0.5*image[j]   + 0.5*constants.color.fog[0]);
                        image[j+1] = Math.ceil(0.5*image[j+1] + 0.5*constants.color.fog[1]);
                        image[j+2] = Math.ceil(0.5*image[j+2] + 0.5*constants.color.fog[2]);
                    }
                }
            }
            frame.data = image;
            offscreenContext.putImageData(frame, 0, 0);
            onscreenContext.drawImage(offscreenCanvas, 0, 0, constants.screen.zoom*constants.screen.width, constants.screen.zoom*constants.screen.height);
            
            // mesure framerate
            frameCounter++;
            
            document.getElementById("fps").innerHTML = (Math.floor(frameCounter/(new Date().getTime()-startTime)*10000)/10)+"fps";
            if(frameCounter > 30) {
                frameCounter = 0;
                startTime = new Date().getTime();
            }
            
            setTimeout(renderFrame, 1);
        };
    
    var pressed = false;
    var oldClientX = false;
    return {
        //you app's visible functions comme here
        eventHandler: function(e) {
            var increment = 10;
            switch(e.keyCode) {
                case 37: //left
                    position.a -= 0.03;
                    break;
                case 38: //up 
                    position.x += Math.cos(position.a)*increment;
                    position.y += Math.sin(position.a)*increment;
                    break;
                case 39: //right
                    position.a += 0.03;
                    break;
                case 40: //down
                    position.x -= Math.cos(position.a)*increment;
                    position.y -= Math.sin(position.a)*increment;
                    break;
                case 87: // w = UP
                    position.z += 10;
                    break;
                case 83: // s = DOWN
                    position.z -= 10;
                    break;
                case 65: // a : antialiasing
                    position.antialiasing = !position.antialiasing;
                    break;
                case 81: //q : swich resolution
                    constants.highres = !constants.highres;
                    if(constants.highres){
                        constants.screen.height = 400;
                        constants.screen.width  = 640;
                        constants.screen.zoom   = 1;
                    } else {
                        constants.screen.height = 100;
                        constants.screen.width  = 160;
                        constants.screen.zoom   = 4;
                    }
                    // initialize constants:
                    constants.init();
                    
                    // create a sort of double buffer (two context):
                    // first a offscreen context
                    offscreenCanvas        = document.createElement('canvas');
                    offscreenCanvas.width  = constants.screen.width;
                    offscreenCanvas.height = constants.screen.height;
                    offscreenContext       = offscreenCanvas.getContext("2d");        
                    
                    // second the onscreen context
                    onscreenCanvas         = document.getElementById("canvas");
                    onscreenCanvas.width   = constants.screen.width  * constants.screen.zoom;
                    onscreenCanvas.height  = constants.screen.height * constants.screen.zoom;
                    onscreenContext        = onscreenCanvas.getContext("2d");
                    
                    // get an ImageData to draw each frame
                    frame = offscreenContext.getImageData(0, 0, constants.screen.width, constants.screen.height);
            }
            voxel.keyTrap(e);
            return false; 
        },
        mouseHandler: function(event) {
            if(event.type === "mousedown"){
                if(event.button === 0) {
                    pressed = true;
                }
            } else if (event.type === "mouseup") {
                if(event.button === 0) {
                    pressed = false;
                }
            } else if (event.type === "mousemove") {
                if(pressed) {
                    var xdiff = event.clientX - oldClientX;
                    position.a += 0.01*xdiff;
                    
                    var ydiff = event.clientY - oldClientY;
                    position.x -= Math.cos(position.a)*2*ydiff;
                    position.y -= Math.sin(position.a)*2*ydiff;
                }
            }
            oldClientX = event.clientX;
            oldClientY = event.clientY;
        },
        keyTrap: function (event) {
            event = event || window.event;
            switch (event.keyCode) {
                case 37:
                case 38:
                case 39:
                case 40:
                    if (event.preventDefault) {
                        event.preventDefault();
                    } else {
                        event.returnValue = false;
                    }
                    break;
            }
        },
        start: function(heighmapFilename, textureFilename) {
            loadHeightmap(heighmapFilename, textureFilename);
        }
    };
})();