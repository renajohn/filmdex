/* global cv, jscanify */
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Modal, Button } from 'react-bootstrap';
import { BsX, BsCamera, BsImage, BsCheck, BsArrowClockwise } from 'react-icons/bs';
import './DocumentScanner.css';

const DocumentScanner = ({ show, onClose, onScanComplete }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const highlightCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const animationFrameRef = useRef(null);
  const scannerRef = useRef(null);
  
  const [mode, setMode] = useState('camera'); // 'camera' or 'edit'
  const [image, setImage] = useState(null);
  const [corners, setCorners] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [opencvReady, setOpencvReady] = useState(false);
  const [opencvLoading, setOpencvLoading] = useState(false);
  const [autoCaptureReady, setAutoCaptureReady] = useState(false);
  const [detectionQuality, setDetectionQuality] = useState(0);
  const [imageDimensions, setImageDimensions] = useState({ 
    width: 0, 
    height: 0, 
    naturalWidth: 0, 
    naturalHeight: 0,
    offsetLeft: 0,
    offsetTop: 0
  });
  const [selectedCorner, setSelectedCorner] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // Load OpenCV.js and jscanify
  useEffect(() => {
    if (show && !opencvReady && !opencvLoading) {
      setOpencvLoading(true);
      
      let opencvLoaded = false;
      let jscanifyLoaded = false;
      
      const checkReady = () => {
        if (opencvLoaded && jscanifyLoaded && typeof cv !== 'undefined' && cv.Mat && typeof jscanify !== 'undefined') {
          setOpencvReady(true);
          setOpencvLoading(false);
          scannerRef.current = new jscanify();
        }
      };
      
      // Load OpenCV.js
      if (typeof cv !== 'undefined' && cv.Mat) {
        opencvLoaded = true;
      } else {
        const opencvScript = document.createElement('script');
        opencvScript.src = 'https://docs.opencv.org/4.7.0/opencv.js';
        opencvScript.async = true;
        opencvScript.onload = () => {
          const checkOpenCV = setInterval(() => {
            if (typeof cv !== 'undefined' && cv.Mat) {
              clearInterval(checkOpenCV);
              opencvLoaded = true;
              checkReady();
            }
          }, 100);
          
          setTimeout(() => {
            clearInterval(checkOpenCV);
            if (!opencvLoaded) {
              console.error('OpenCV.js failed to load');
              setOpencvLoading(false);
              alert('Erreur: Impossible de charger OpenCV.js');
            }
          }, 15000);
        };
        opencvScript.onerror = () => {
          console.error('Failed to load OpenCV.js');
          setOpencvLoading(false);
          alert('Erreur: Impossible de charger OpenCV.js');
        };
        document.body.appendChild(opencvScript);
      }
      
      // Load jscanify (browser version from CDN)
      if (typeof jscanify !== 'undefined') {
        jscanifyLoaded = true;
        checkReady();
      } else {
        const jscanifyScript = document.createElement('script');
        jscanifyScript.src = 'https://cdn.jsdelivr.net/gh/ColonelParrot/jscanify@master/src/jscanify.min.js';
        jscanifyScript.async = true;
        jscanifyScript.onload = () => {
          if (typeof jscanify !== 'undefined') {
            jscanifyLoaded = true;
            checkReady();
          }
        };
        jscanifyScript.onerror = () => {
          console.error('Failed to load jscanify');
          setOpencvLoading(false);
          alert('Erreur: Impossible de charger jscanify');
        };
        document.body.appendChild(jscanifyScript);
      }
      
      if (opencvLoaded && jscanifyLoaded) {
        checkReady();
      }
    }
  }, [show, opencvReady, opencvLoading]);

  // Initialize camera when mode changes to camera
  useEffect(() => {
    if (show && mode === 'camera' && opencvReady) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [show, mode, opencvReady]);

  // Real-time detection loop
  useEffect(() => {
    if (mode === 'camera' && opencvReady && videoRef.current && scannerRef.current && canvasRef.current) {
      startDetectionLoop();
    } else {
      stopDetectionLoop();
    }
    return () => {
      stopDetectionLoop();
    };
  }, [mode, opencvReady]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        videoRef.current.play();
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      alert('Impossible d\'accéder à la caméra. Veuillez vérifier les permissions.');
    }
  };

  const stopCamera = () => {
    stopDetectionLoop();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const startDetectionLoop = () => {
    if (!videoRef.current || !canvasRef.current || !highlightCanvasRef.current || !scannerRef.current) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const highlightCanvas = highlightCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const highlightCtx = highlightCanvas.getContext('2d');

    const detect = () => {
      if (!video.videoWidth || !video.videoHeight) {
        animationFrameRef.current = requestAnimationFrame(detect);
        return;
      }

      // Set canvas size
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      highlightCanvas.width = video.videoWidth;
      highlightCanvas.height = video.videoHeight;

      // Draw video frame to canvas
      ctx.drawImage(video, 0, 0);

      try {
        // Highlight paper in real-time
        const highlightedCanvas = scannerRef.current.highlightPaper(canvas, {
          color: autoCaptureReady ? '#00ff00' : '#ffaa00',
          thickness: 3
        });
        
        highlightCtx.clearRect(0, 0, highlightCanvas.width, highlightCanvas.height);
        highlightCtx.drawImage(highlightedCanvas, 0, 0);

        // Check if paper is well detected for auto-capture
        checkDetectionQuality(canvas);
      } catch (error) {
        console.error('Detection error:', error);
      }

      animationFrameRef.current = requestAnimationFrame(detect);
    };

    detect();
  };

  const stopDetectionLoop = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  };

  const checkDetectionQuality = (canvas) => {
    try {
      const img = cv.imread(canvas);
      const contour = scannerRef.current.findPaperContour(img);
      
      if (contour && !contour.isDeleted()) {
        const area = cv.contourArea(contour);
        const canvasArea = canvas.width * canvas.height;
        const areaRatio = area / canvasArea;
        
        // Check if contour is approximately rectangular (4 corners)
        const peri = cv.arcLength(contour, true);
        const approx = new cv.Mat();
        cv.approxPolyDP(contour, approx, 0.02 * peri, true);
        
        const isGoodDetection = areaRatio > 0.3 && areaRatio < 0.95 && approx.rows >= 4;
        
        setDetectionQuality(areaRatio);
        setAutoCaptureReady(isGoodDetection);
        
        approx.delete();
        contour.delete();
      } else {
        setAutoCaptureReady(false);
        setDetectionQuality(0);
      }
      
      img.delete();
    } catch (error) {
      console.error('Quality check error:', error);
      setAutoCaptureReady(false);
    }
  };

  const captureImage = () => {
    if (!videoRef.current || !canvasRef.current || !scannerRef.current) {
      console.error('Required refs not available');
      return;
    }
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!video.videoWidth || !video.videoHeight) {
      alert('La vidéo n\'est pas encore prête. Attendez quelques instants.');
      return;
    }
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    
    const imageData = canvas.toDataURL('image/jpeg');
    setImage(imageData);
    setMode('edit');
    stopCamera();
    
    // Set default corners immediately based on captured image (cover entire image)
    const marginX = canvas.width * 0.01;
    const marginY = canvas.height * 0.01;
    setCorners([
      { x: marginX, y: marginY },
      { x: canvas.width - marginX, y: marginY },
      { x: canvas.width - marginX, y: canvas.height - marginY },
      { x: marginX, y: canvas.height - marginY }
    ]);
    
    setTimeout(() => processImage(imageData), 100);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const imageData = event.target.result;
      setImage(imageData);
      setMode('edit');
      
        // Set default corners immediately (cover entire image)
        const img = new Image();
        img.onload = () => {
          const marginX = img.width * 0.01;
          const marginY = img.height * 0.01;
          setCorners([
            { x: marginX, y: marginY },
            { x: img.width - marginX, y: marginY },
            { x: img.width - marginX, y: img.height - marginY },
            { x: marginX, y: img.height - marginY }
          ]);
        };
        img.src = imageData;
      
      setTimeout(() => processImage(imageData), 100);
    };
    reader.readAsDataURL(file);
  };

  const processImage = (imageData) => {
    if (!opencvReady || !scannerRef.current) {
      console.error('OpenCV or scanner not ready');
      // Set default corners anyway
      const img = new Image();
      img.onload = () => {
        const margin = Math.min(img.width, img.height) * 0.1;
        setCorners([
          { x: margin, y: margin },
          { x: img.width - margin, y: margin },
          { x: img.width - margin, y: img.height - margin },
          { x: margin, y: img.height - margin }
        ]);
        setIsProcessing(false);
      };
      img.src = imageData;
      return;
    }

    setIsProcessing(true);
    const img = new Image();
    img.onload = () => {
      if (!canvasRef.current) {
        setIsProcessing(false);
        return;
      }
      
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      try {
        // Find paper contour using jscanify
        const imgMat = cv.imread(canvas);
        const contour = scannerRef.current.findPaperContour(imgMat);
        
        let detectedCorners = null;
        
        if (contour && !contour.isDeleted()) {
          const area = cv.contourArea(contour);
          const imgArea = img.width * img.height;
          const areaRatio = area / imgArea;
          
          // Only use contour if it's a reasonable size (at least 20% of image)
          if (areaRatio > 0.2 && areaRatio < 0.98) {
            // Get corner points with more aggressive approximation
            const peri = cv.arcLength(contour, true);
            const approx = new cv.Mat();
            // Use a larger epsilon for more aggressive approximation
            cv.approxPolyDP(contour, approx, 0.03 * peri, true);
            
            if (approx.rows >= 4) {
              // Extract corner points
              const points = [];
              for (let i = 0; i < Math.min(approx.rows, 4); i++) {
                points.push({
                  x: approx.data32S[i * 2],
                  y: approx.data32S[i * 2 + 1]
                });
              }
              
              // Order points: top-left, top-right, bottom-right, bottom-left
              detectedCorners = orderPoints(points);
              console.log('Corners detected from contour:', detectedCorners);
              approx.delete();
            } else if (approx.rows > 0) {
              // If we have some points but not 4, use bounding rect
              const rect = cv.boundingRect(contour);
              detectedCorners = [
                { x: rect.x, y: rect.y },
                { x: rect.x + rect.width, y: rect.y },
                { x: rect.x + rect.width, y: rect.y + rect.height },
                { x: rect.x, y: rect.y + rect.height }
              ];
              console.log('Using bounding rect from contour:', detectedCorners);
              approx.delete();
            }
          }
          
          if (contour && !contour.isDeleted()) {
            contour.delete();
          }
        }
        
        // If no good detection, use default corners covering entire image
        if (!detectedCorners) {
          const marginX = img.width * 0.01;
          const marginY = img.height * 0.01;
          detectedCorners = [
            { x: marginX, y: marginY },
            { x: img.width - marginX, y: marginY },
            { x: img.width - marginX, y: img.height - marginY },
            { x: marginX, y: img.height - marginY }
          ];
          console.log('No good contour found, using default corners:', detectedCorners);
        }
        
        // Validate corners are within image bounds
        const validatedCorners = detectedCorners.map(corner => ({
          x: Math.max(0, Math.min(corner.x, img.width)),
          y: Math.max(0, Math.min(corner.y, img.height))
        }));
        
        setCorners(validatedCorners);
        imgMat.delete();
      } catch (error) {
        console.error('Error processing image:', error);
        // Default to image with margin on error
        const margin = Math.min(img.width, img.height) * 0.1;
        setCorners([
          { x: margin, y: margin },
          { x: img.width - margin, y: margin },
          { x: img.width - margin, y: img.height - margin },
          { x: margin, y: img.height - margin }
        ]);
      }
      setIsProcessing(false);
    };
    img.onerror = () => {
      console.error('Error loading image');
      setIsProcessing(false);
    };
    img.src = imageData;
  };

  const orderPoints = (pts) => {
    // Sort by sum (top-left has smallest sum, bottom-right has largest)
    const sortedBySum = [...pts].sort((a, b) => (a.x + a.y) - (b.x + b.y));
    // Sort by difference (top-right has smallest diff, bottom-left has largest)
    const sortedByDiff = [...pts].sort((a, b) => (b.x - b.y) - (a.x - a.y));
    
    const topLeft = sortedBySum[0];
    const bottomRight = sortedBySum[sortedBySum.length - 1];
    const topRight = sortedByDiff[0];
    const bottomLeft = sortedByDiff[sortedByDiff.length - 1];
    
    return [topLeft, topRight, bottomRight, bottomLeft];
  };

  const extractDocument = () => {
    if (!image) {
      alert('Aucune image à traiter');
      return;
    }
    
    if (!corners || corners.length !== 4) {
      alert('Les coins du document ne sont pas définis');
      return;
    }
    
    setIsProcessing(true);
    const img = new Image();
    img.onload = () => {
      try {
        // Calculate destination dimensions from corners
        const topWidth = Math.sqrt(Math.pow(corners[1].x - corners[0].x, 2) + Math.pow(corners[1].y - corners[0].y, 2));
        const bottomWidth = Math.sqrt(Math.pow(corners[2].x - corners[3].x, 2) + Math.pow(corners[2].y - corners[3].y, 2));
        const leftHeight = Math.sqrt(Math.pow(corners[3].x - corners[0].x, 2) + Math.pow(corners[3].y - corners[0].y, 2));
        const rightHeight = Math.sqrt(Math.pow(corners[2].x - corners[1].x, 2) + Math.pow(corners[2].y - corners[1].y, 2));
        
        const width = Math.max(topWidth, bottomWidth);
        const height = Math.max(leftHeight, rightHeight);
        
        // Use OpenCV for perspective transform if available
        if (opencvReady && typeof cv !== 'undefined' && cv.getPerspectiveTransform) {
          try {
            // Create source canvas
            const srcCanvas = document.createElement('canvas');
            srcCanvas.width = img.width;
            srcCanvas.height = img.height;
            const srcCtx = srcCanvas.getContext('2d');
            srcCtx.drawImage(img, 0, 0);
            
            // Read image into OpenCV
            const src = cv.imread(srcCanvas);
            
            // Source points (corners)
            const srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
              corners[0].x, corners[0].y,
              corners[1].x, corners[1].y,
              corners[2].x, corners[2].y,
              corners[3].x, corners[3].y
            ]);
            
            // Destination points (rectangle)
            const dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
              0, 0,
              width, 0,
              width, height,
              0, height
            ]);
            
            // Get perspective transform matrix
            const M = cv.getPerspectiveTransform(srcPoints, dstPoints);
            
            // Create destination canvas
            const dstCanvas = document.createElement('canvas');
            dstCanvas.width = width;
            dstCanvas.height = height;
            
            // Apply perspective transform
            const dst = new cv.Mat();
            const dsize = new cv.Size(width, height);
            cv.warpPerspective(src, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
            
            // Draw result to canvas
            cv.imshow(dstCanvas, dst);
            
            // Convert to blob and call callback
            dstCanvas.toBlob((blob) => {
              if (blob && onScanComplete) {
                const file = new File([blob], 'scanned-cover.jpg', { type: 'image/jpeg' });
                onScanComplete(file);
                handleClose();
              }
              setIsProcessing(false);
              
              // Clean up
              src.delete();
              srcPoints.delete();
              dstPoints.delete();
              M.delete();
              dst.delete();
            }, 'image/jpeg', 0.95);
            
            return;
          } catch (cvError) {
            console.error('OpenCV perspective transform error:', cvError);
            // Fall through to jscanify or manual method
          }
        }
        
        // Try jscanify if available
        if (scannerRef.current && scannerRef.current.extractPaper) {
          try {
            const resultCanvas = scannerRef.current.extractPaper(img, width, height);
            
            resultCanvas.toBlob((blob) => {
              if (blob && onScanComplete) {
                const file = new File([blob], 'scanned-cover.jpg', { type: 'image/jpeg' });
                onScanComplete(file);
                handleClose();
              }
              setIsProcessing(false);
            }, 'image/jpeg', 0.95);
            return;
          } catch (jscanifyError) {
            console.error('jscanify extractPaper error:', jscanifyError);
            // Fall through to manual method
          }
        }
        
        // Fallback: manual perspective correction using canvas
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        // Create source canvas to get image data
        const srcCanvas = document.createElement('canvas');
        srcCanvas.width = img.width;
        srcCanvas.height = img.height;
        const srcCtx = srcCanvas.getContext('2d');
        srcCtx.drawImage(img, 0, 0);
        const srcData = srcCtx.getImageData(0, 0, img.width, img.height);
        
        // Manual perspective transform using bilinear interpolation
        const dstData = ctx.createImageData(width, height);
        
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            // Map destination pixel to source using inverse perspective transform
            const u = x / width;
            const v = y / height;
            
            // Bilinear interpolation of source corners
            const topX = corners[0].x + (corners[1].x - corners[0].x) * u;
            const topY = corners[0].y + (corners[1].y - corners[0].y) * u;
            const bottomX = corners[3].x + (corners[2].x - corners[3].x) * u;
            const bottomY = corners[3].y + (corners[2].y - corners[3].y) * v;
            
            const srcX = topX + (bottomX - topX) * v;
            const srcY = topY + (bottomY - topY) * v;
            
            // Get pixel from source with bounds checking and bilinear sampling
            const srcXInt = Math.floor(srcX);
            const srcYInt = Math.floor(srcY);
            const srcXFrac = srcX - srcXInt;
            const srcYFrac = srcY - srcYInt;
            
            if (srcXInt >= 0 && srcXInt < img.width - 1 && srcYInt >= 0 && srcYInt < img.height - 1) {
              const dstIdx = (y * width + x) * 4;
              
              // Bilinear interpolation
              const idx00 = (srcYInt * img.width + srcXInt) * 4;
              const idx01 = (srcYInt * img.width + (srcXInt + 1)) * 4;
              const idx10 = ((srcYInt + 1) * img.width + srcXInt) * 4;
              const idx11 = ((srcYInt + 1) * img.width + (srcXInt + 1)) * 4;
              
              for (let c = 0; c < 4; c++) {
                const val00 = srcData.data[idx00 + c];
                const val01 = srcData.data[idx01 + c];
                const val10 = srcData.data[idx10 + c];
                const val11 = srcData.data[idx11 + c];
                
                const val0 = val00 * (1 - srcXFrac) + val01 * srcXFrac;
                const val1 = val10 * (1 - srcXFrac) + val11 * srcXFrac;
                dstData.data[dstIdx + c] = val0 * (1 - srcYFrac) + val1 * srcYFrac;
              }
            }
          }
        }
        
        ctx.putImageData(dstData, 0, 0);
        
        canvas.toBlob((blob) => {
          if (blob && onScanComplete) {
            const file = new File([blob], 'scanned-cover.jpg', { type: 'image/jpeg' });
            onScanComplete(file);
            handleClose();
          }
          setIsProcessing(false);
        }, 'image/jpeg', 0.95);
      } catch (error) {
        console.error('Error extracting document:', error);
        alert('Erreur lors de l\'extraction du document: ' + error.message);
        setIsProcessing(false);
      }
    };
    img.src = image;
  };

  // Auto-capture when detection is good
  useEffect(() => {
    if (autoCaptureReady && mode === 'camera' && !isProcessing) {
      // Wait a bit to ensure stable detection
      const timer = setTimeout(() => {
        if (autoCaptureReady) {
          captureImage();
        }
      }, 1000); // 1 second delay for stable detection
      
      return () => clearTimeout(timer);
    }
  }, [autoCaptureReady, mode, isProcessing]);

  // Handle dragging corners
  const handleMouseMove = useCallback((e) => {
    if (!isDragging || selectedCorner === null || !imageDimensions.width) return;
    
    const overlay = document.querySelector('.scanner-corners-overlay');
    if (!overlay) return;
    
    const rect = overlay.getBoundingClientRect();
    const scaleX = imageDimensions.naturalWidth / imageDimensions.width;
    const scaleY = imageDimensions.naturalHeight / imageDimensions.height;
    
    const x = (e.touches ? e.touches[0].clientX : e.clientX - rect.left) * scaleX;
    const y = (e.touches ? e.touches[0].clientY : e.clientY - rect.top) * scaleY;
    
    // Clamp to image bounds
    const clampedX = Math.max(0, Math.min(x, imageDimensions.naturalWidth));
    const clampedY = Math.max(0, Math.min(y, imageDimensions.naturalHeight));
    
    setCorners(prev => {
      const newCorners = [...prev];
      newCorners[selectedCorner] = { x: clampedX, y: clampedY };
      return newCorners;
    });
  }, [isDragging, selectedCorner, imageDimensions]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setSelectedCorner(null);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleMouseMove, { passive: false });
      window.addEventListener('touchend', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('touchmove', handleMouseMove);
        window.removeEventListener('touchend', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const handleClose = () => {
    stopCamera();
    setImage(null);
    setCorners(null);
    setMode('camera');
    setAutoCaptureReady(false);
    setDetectionQuality(0);
    setSelectedCorner(null);
    setIsDragging(false);
    onClose();
  };

  const handleRetry = () => {
    setImage(null);
    setCorners(null);
    setMode('camera');
    setAutoCaptureReady(false);
    setDetectionQuality(0);
    startCamera();
  };

  return (
    <Modal show={show} onHide={handleClose} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>Scanner la couverture</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {opencvLoading && (
          <div className="text-center p-4">
            <div className="spinner-border" role="status">
              <span className="visually-hidden">Chargement...</span>
            </div>
            <p className="mt-2">Chargement d'OpenCV.js...</p>
          </div>
        )}
        
        {mode === 'camera' && !opencvLoading && opencvReady && (
          <div className="scanner-camera-container">
            <div className="scanner-video-wrapper">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="scanner-video"
              />
              <canvas
                ref={highlightCanvasRef}
                className="scanner-highlight-overlay"
              />
              {autoCaptureReady && (
                <div className="scanner-auto-capture-indicator">
                  <div className="scanner-pulse"></div>
                  <p>Document détecté - Capture automatique...</p>
                </div>
              )}
            </div>
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            <div className="scanner-controls">
              <Button
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                className="scanner-btn"
              >
                <BsImage /> Choisir un fichier
              </Button>
              <Button
                variant="primary"
                onClick={captureImage}
                className="scanner-btn"
              >
                <BsCamera /> Capturer manuellement
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </div>
        )}
        
        {mode === 'edit' && (
          <div className="scanner-edit-container">
            {!image ? (
              <div className="scanner-processing">
                <p>Chargement de l'image...</p>
              </div>
            ) : (
              <>
                {isProcessing && (
                  <div className="scanner-processing-overlay">
                    <div className="spinner-border" role="status">
                      <span className="visually-hidden">Traitement...</span>
                    </div>
                    <p>Traitement de l'image...</p>
                  </div>
                )}
                <div className="scanner-preview-wrapper" style={{ position: 'relative' }}>
                  <img 
                    src={image} 
                    alt="Preview" 
                    className="scanner-preview-image"
                    ref={(img) => {
                      if (img && img.complete) {
                        // Image already loaded
                        setTimeout(() => {
                          const wrapper = img.parentElement;
                          const rect = wrapper?.getBoundingClientRect();
                          const imgRect = img.getBoundingClientRect();
                          setImageDimensions({
                            width: img.offsetWidth || img.clientWidth || img.naturalWidth,
                            height: img.offsetHeight || img.clientHeight || img.naturalHeight,
                            naturalWidth: img.naturalWidth,
                            naturalHeight: img.naturalHeight,
                            offsetLeft: rect ? imgRect.left - rect.left : 0,
                            offsetTop: rect ? imgRect.top - rect.top : 0
                          });
                          // Set default corners if not set
                          if (!corners || corners.length !== 4) {
                            const marginX = img.naturalWidth * 0.1;
                            const marginY = img.naturalHeight * 0.1;
                            setCorners([
                              { x: marginX, y: marginY },
                              { x: img.naturalWidth - marginX, y: marginY },
                              { x: img.naturalWidth - marginX, y: img.naturalHeight - marginY },
                              { x: marginX, y: img.naturalHeight - marginY }
                            ]);
                          }
                        }, 100);
                      }
                    }}
                    onLoad={(e) => {
                      const img = e.target;
                      // Use setTimeout to ensure dimensions are calculated after render
                      setTimeout(() => {
                        const wrapper = img.parentElement;
                        const rect = wrapper?.getBoundingClientRect();
                        const imgRect = img.getBoundingClientRect();
                        setImageDimensions({
                          width: img.offsetWidth || img.clientWidth || img.naturalWidth,
                          height: img.offsetHeight || img.clientHeight || img.naturalHeight,
                          naturalWidth: img.naturalWidth,
                          naturalHeight: img.naturalHeight,
                          offsetLeft: rect ? imgRect.left - rect.left : 0,
                          offsetTop: rect ? imgRect.top - rect.top : 0
                        });
                        // Set default corners if not set (cover entire image)
                        if (!corners || corners.length !== 4) {
                          const marginX = img.naturalWidth * 0.01;
                          const marginY = img.naturalHeight * 0.01;
                          setCorners([
                            { x: marginX, y: marginY },
                            { x: img.naturalWidth - marginX, y: marginY },
                            { x: img.naturalWidth - marginX, y: img.naturalHeight - marginY },
                            { x: marginX, y: img.naturalHeight - marginY }
                          ]);
                        }
                      }, 100);
                    }}
                    style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
                  />
                  {corners && corners.length === 4 && (() => {
                    // Use natural dimensions if display dimensions not yet calculated
                    const displayWidth = imageDimensions.width || imageDimensions.naturalWidth || 0;
                    const displayHeight = imageDimensions.height || imageDimensions.naturalHeight || 0;
                    const naturalWidth = imageDimensions.naturalWidth || displayWidth;
                    const naturalHeight = imageDimensions.naturalHeight || displayHeight;
                    
                    if (displayWidth === 0 || naturalWidth === 0) return null;
                    
                    return (
                    <div
                      className="scanner-corners-overlay"
                      style={{
                        position: 'absolute',
                        top: `${imageDimensions.offsetTop || 0}px`,
                        left: `${imageDimensions.offsetLeft || 0}px`,
                        width: `${displayWidth}px`,
                        height: `${displayHeight}px`,
                        pointerEvents: isDragging ? 'auto' : 'none',
                        zIndex: 2,
                        cursor: isDragging ? 'grabbing' : 'default'
                      }}
                      onMouseDown={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const scaleX = naturalWidth / displayWidth;
                        const scaleY = naturalHeight / displayHeight;
                        const x = (e.clientX - rect.left) * scaleX;
                        const y = (e.clientY - rect.top) * scaleY;
                        
                        // Check if clicking near a corner
                        for (let i = 0; i < corners.length; i++) {
                          const corner = corners[i];
                          const dist = Math.sqrt(Math.pow(x - corner.x, 2) + Math.pow(y - corner.y, 2));
                          if (dist < 30 * scaleX) {
                            setSelectedCorner(i);
                            setIsDragging(true);
                            e.preventDefault();
                            e.stopPropagation();
                            return;
                          }
                        }
                      }}
                      onTouchStart={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const touch = e.touches[0];
                        const scaleX = naturalWidth / displayWidth;
                        const scaleY = naturalHeight / displayHeight;
                        const x = (touch.clientX - rect.left) * scaleX;
                        const y = (touch.clientY - rect.top) * scaleY;
                        
                        // Check if touching near a corner
                        for (let i = 0; i < corners.length; i++) {
                          const corner = corners[i];
                          const dist = Math.sqrt(Math.pow(x - corner.x, 2) + Math.pow(y - corner.y, 2));
                          if (dist < 40 * scaleX) {
                            setSelectedCorner(i);
                            setIsDragging(true);
                            e.preventDefault();
                            e.stopPropagation();
                            return;
                          }
                        }
                      }}
                    >
                      <svg
                        width="100%"
                        height="100%"
                        style={{ pointerEvents: 'none' }}
                      >
                        {(() => {
                          const scaleX = displayWidth / naturalWidth;
                          const scaleY = displayHeight / naturalHeight;
                          const scaledCorners = corners.map(corner => ({
                            x: corner.x * scaleX,
                            y: corner.y * scaleY
                          }));
                          
                          return (
                            <>
                              {/* Draw lines between corners */}
                              <polyline
                                points={scaledCorners.map(c => `${c.x},${c.y}`).join(' ') + ` ${scaledCorners[0].x},${scaledCorners[0].y}`}
                                fill="none"
                                stroke="#00ff00"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              {/* Draw corner markers */}
                              {scaledCorners.map((corner, index) => (
                                <g key={index} style={{ pointerEvents: 'all', cursor: isDragging && selectedCorner === index ? 'grabbing' : 'grab' }}>
                                  <circle
                                    cx={corner.x}
                                    cy={corner.y}
                                    r="15"
                                    fill={selectedCorner === index ? "#ff0000" : "#00ff00"}
                                    stroke="#ffffff"
                                    strokeWidth="3"
                                  />
                                  <circle
                                    cx={corner.x}
                                    cy={corner.y}
                                    r="8"
                                    fill="#ffffff"
                                  />
                                </g>
                              ))}
                            </>
                          );
                        })()}
                      </svg>
                      {/* Invisible hit areas for corners */}
                      {(() => {
                        const scaleX = displayWidth / naturalWidth;
                        const scaleY = displayHeight / naturalHeight;
                        const scaledCorners = corners.map(corner => ({
                          x: corner.x * scaleX,
                          y: corner.y * scaleY
                        }));
                        return scaledCorners.map((corner, index) => (
                          <div
                            key={`hit-${index}`}
                            style={{
                              position: 'absolute',
                              left: `${corner.x - 20}px`,
                              top: `${corner.y - 20}px`,
                              width: '40px',
                              height: '40px',
                              cursor: isDragging && selectedCorner === index ? 'grabbing' : 'grab',
                              zIndex: 3
                            }}
                            onMouseDown={(e) => {
                              setSelectedCorner(index);
                              setIsDragging(true);
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onTouchStart={(e) => {
                              setSelectedCorner(index);
                              setIsDragging(true);
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          />
                        ));
                      })()}
                    </div>
                  );
                  })()}
                </div>
                <div className="scanner-edit-controls">
                  <p className="scanner-hint">
                    {isProcessing 
                      ? "Détection des bords en cours..."
                      : corners && corners.length === 4 
                        ? "Glissez les points verts pour ajuster les bords du livre, puis cliquez sur \"Valider\"."
                        : "Ajustez les coins si nécessaire, puis cliquez sur \"Valider\"."}
                  </p>
                  <div className="scanner-buttons">
                    <Button variant="secondary" onClick={handleRetry} disabled={isProcessing}>
                      <BsArrowClockwise /> Réessayer
                    </Button>
                    <Button 
                      variant="success" 
                      onClick={extractDocument}
                      disabled={isProcessing}
                    >
                      <BsCheck /> Valider
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </Modal.Body>
    </Modal>
  );
};

export default DocumentScanner;
