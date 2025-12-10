// DOM 元素
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const targetSizeInput = document.getElementById('targetSize');
const outputFormatSelect = document.getElementById('outputFormat');
const resultsContainer = document.getElementById('results');

// 點擊上傳區觸發檔案選擇
uploadArea.addEventListener('click', () => fileInput.click());

// 檔案選擇事件
fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
});

// 拖放事件
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
});

// 處理上傳的檔案
function handleFiles(files) {
    for (const file of files) {
        if (!file.type.match(/^image\/(png|jpeg|webp)$/)) {
            showError(`${file.name} 不是支援的圖片格式`);
            continue;
        }
        compressImage(file);
    }
}

// 壓縮圖片
async function compressImage(file) {
    const targetSizeKB = parseInt(targetSizeInput.value);
    const targetSizeBytes = targetSizeKB * 1024;
    const outputFormat = outputFormatSelect.value;

    // 顯示處理中
    const processingId = showProcessing(file.name);

    try {
        // 讀取圖片
        const img = await loadImage(file);

        // 建立 canvas
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        let resultBlob;
        let quality = 0.9;

        // PNG 不支援品質調整，需要用縮小尺寸的方式
        if (outputFormat === 'image/png') {
            resultBlob = await canvasToBlob(canvas, outputFormat);

            // 如果 PNG 太大，逐步縮小尺寸
            let scale = 1;
            while (resultBlob.size > targetSizeBytes && scale > 0.1) {
                scale -= 0.1;
                const newWidth = Math.floor(img.width * scale);
                const newHeight = Math.floor(img.height * scale);
                canvas.width = newWidth;
                canvas.height = newHeight;
                ctx.drawImage(img, 0, 0, newWidth, newHeight);
                resultBlob = await canvasToBlob(canvas, outputFormat);
            }
        } else {
            // JPEG 和 WebP 使用二分搜尋找到適當的品質
            resultBlob = await canvasToBlob(canvas, outputFormat, quality);

            if (resultBlob.size > targetSizeBytes) {
                // 二分搜尋
                let minQ = 0.01;
                let maxQ = 0.9;

                for (let i = 0; i < 10; i++) {
                    quality = (minQ + maxQ) / 2;
                    resultBlob = await canvasToBlob(canvas, outputFormat, quality);

                    if (resultBlob.size > targetSizeBytes) {
                        maxQ = quality;
                    } else {
                        minQ = quality;
                    }

                    // 如果已經很接近目標大小，停止搜尋
                    if (Math.abs(resultBlob.size - targetSizeBytes) < targetSizeBytes * 0.05) {
                        break;
                    }
                }

                // 如果還是太大，縮小尺寸
                let scale = 1;
                while (resultBlob.size > targetSizeBytes && scale > 0.1) {
                    scale -= 0.1;
                    const newWidth = Math.floor(img.width * scale);
                    const newHeight = Math.floor(img.height * scale);
                    canvas.width = newWidth;
                    canvas.height = newHeight;
                    ctx.drawImage(img, 0, 0, newWidth, newHeight);
                    resultBlob = await canvasToBlob(canvas, outputFormat, 0.8);
                }
            }
        }

        // 移除處理中訊息，顯示結果
        removeProcessing(processingId);
        showResult(file, resultBlob, outputFormat);

    } catch (error) {
        removeProcessing(processingId);
        showError(`處理 ${file.name} 時發生錯誤: ${error.message}`);
    }
}

// 載入圖片
function loadImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

// Canvas 轉 Blob
function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => {
        canvas.toBlob(resolve, type, quality);
    });
}

// 顯示處理中
function showProcessing(fileName) {
    const id = 'processing-' + Date.now();
    const div = document.createElement('div');
    div.id = id;
    div.className = 'processing';
    div.textContent = `正在處理 ${fileName}`;
    resultsContainer.appendChild(div);
    return id;
}

// 移除處理中訊息
function removeProcessing(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

// 顯示結果
function showResult(originalFile, compressedBlob, format) {
    const originalSize = originalFile.size;
    const compressedSize = compressedBlob.size;
    const reduction = ((1 - compressedSize / originalSize) * 100).toFixed(1);

    // 取得副檔名
    const ext = format.split('/')[1];
    const newFileName = originalFile.name.replace(/\.[^.]+$/, `.${ext}`);

    const div = document.createElement('div');
    div.className = 'result-item';
    div.innerHTML = `
        <img src="${URL.createObjectURL(compressedBlob)}" alt="預覽">
        <div class="result-info">
            <h3>${newFileName}</h3>
            <p class="size-info">
                原始大小: ${formatSize(originalSize)} →
                <span>壓縮後: ${formatSize(compressedSize)}</span>
            </p>
            <p class="reduction">減少了 ${reduction}%</p>
        </div>
        <button class="download-btn" onclick="downloadBlob('${URL.createObjectURL(compressedBlob)}', '${newFileName}')">
            下載
        </button>
    `;
    resultsContainer.appendChild(div);
}

// 顯示錯誤
function showError(message) {
    const div = document.createElement('div');
    div.className = 'error';
    div.textContent = message;
    resultsContainer.appendChild(div);

    // 5秒後自動消失
    setTimeout(() => div.remove(), 5000);
}

// 格式化檔案大小
function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// 下載檔案
function downloadBlob(url, fileName) {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
}
