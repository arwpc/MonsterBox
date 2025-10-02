#!/bin/bash

# Script to add video library endpoints to goblin servers
# This allows goblins to serve their local video library via web interface

GOBLIN1_IP="192.168.8.160"
GOBLIN2_IP="192.168.8.161"
PASSWORD="klrklr89!"

echo "🎃 Adding Video Library endpoints to Goblin servers..."

# Create the video library code to insert
cat > /tmp/goblin-video-library-code.txt << 'EOF'

    // Video Library endpoints - serve local video library
    this.app.get('/video-library', (req, res) => {
      res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Goblin Video Library - ${this.goblinId}</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css">
    <style>
        body { background: #1a1a1a; color: #fff; }
        .video-card { background: #2a2a2a; border: 1px solid #444; transition: transform 0.2s; }
        .video-card:hover { transform: translateY(-5px); border-color: #ff6b00; }
        .video-thumbnail { width: 100%; height: 200px; object-fit: cover; background: #000; }
        .play-btn { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                    font-size: 3rem; color: #ff6b00; opacity: 0.8; }
        .video-card:hover .play-btn { opacity: 1; }
    </style>
</head>
<body>
    <nav class="navbar navbar-dark bg-dark">
        <div class="container-fluid">
            <span class="navbar-brand">
                <i class="bi bi-film"></i> Goblin Video Library - ${this.goblinId}
            </span>
            <button class="btn btn-outline-warning" onclick="location.reload()">
                <i class="bi bi-arrow-clockwise"></i> Refresh
            </button>
        </div>
    </nav>

    <div class="container-fluid py-4">
        <div class="row mb-3">
            <div class="col">
                <h4><i class="bi bi-collection-play"></i> Local Videos</h4>
                <p class="text-muted">Videos stored on this Goblin</p>
            </div>
        </div>
        
        <div id="videoGrid" class="row g-3">
            <div class="col-12 text-center">
                <div class="spinner-border text-warning" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
            </div>
        </div>
    </div>

    <script>
        async function loadVideos() {
            try {
                const response = await fetch('/video-library/api/videos');
                const data = await response.json();
                
                const grid = document.getElementById('videoGrid');
                
                if (!data.success || !data.videos || data.videos.length === 0) {
                    grid.innerHTML = '<div class="col-12 text-center text-muted"><h5>No videos found</h5></div>';
                    return;
                }
                
                grid.innerHTML = data.videos.map(video => \`
                    <div class="col-md-6 col-lg-4 col-xl-3">
                        <div class="card video-card">
                            <div class="position-relative">
                                <div class="video-thumbnail d-flex align-items-center justify-content-center">
                                    <i class="bi bi-film" style="font-size: 4rem; color: #666;"></i>
                                </div>
                                <i class="bi bi-play-circle-fill play-btn"></i>
                            </div>
                            <div class="card-body">
                                <h6 class="card-title text-truncate" title="\${video.name}">\${video.name}</h6>
                                <p class="card-text small text-muted">
                                    <i class="bi bi-file-earmark-play"></i> \${video.size}<br>
                                    <i class="bi bi-folder"></i> \${video.category || 'Uncategorized'}
                                </p>
                                <button class="btn btn-sm btn-warning w-100" onclick="playVideo('\${video.path}', '\${video.name}')">
                                    <i class="bi bi-play-fill"></i> Play
                                </button>
                            </div>
                        </div>
                    </div>
                \`).join('');
            } catch (error) {
                console.error('Error loading videos:', error);
                document.getElementById('videoGrid').innerHTML = 
                    '<div class="col-12 text-center text-danger"><h5>Error loading videos</h5></div>';
            }
        }
        
        async function playVideo(path, name) {
            try {
                const response = await fetch('/play-video', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename: path, loop: false })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    alert('Now playing: ' + name);
                } else {
                    alert('Failed to play video: ' + result.error);
                }
            } catch (error) {
                alert('Error playing video: ' + error.message);
            }
        }
        
        loadVideos();
    </script>
</body>
</html>
      `);
    });

    // API endpoint to get video list
    this.app.get('/video-library/api/videos', async (req, res) => {
      try {
        const videoDir = path.join(__dirname, 'media', 'video');
        const videos = await this.scanVideoDirectory(videoDir);
        
        res.json({
          success: true,
          videos: videos,
          count: videos.length
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
EOF

# Function to add code to a goblin
add_to_goblin() {
    local IP=$1
    local NAME=$2
    
    echo "📡 Adding video library to $NAME ($IP)..."
    
    # Check if already has video-library endpoint
    HAS_ENDPOINT=$(sshpass -p "$PASSWORD" ssh remote@$IP "grep -c '/video-library' /home/remote/goblin/server.js" || echo "0")
    
    if [ "$HAS_ENDPOINT" != "0" ]; then
        echo "⚠️  $NAME already has video library endpoints, skipping..."
        return
    fi
    
    # Backup the original file
    sshpass -p "$PASSWORD" ssh remote@$IP "cp /home/remote/goblin/server.js /home/remote/goblin/server.js.backup"
    
    # Insert the new code before "Status and monitoring" comment
    sshpass -p "$PASSWORD" ssh remote@$IP "
        sed -i '/\/\/ Status and monitoring/i\\
    // Video Library endpoints - serve local video library\\
    this.app.get(\"/video-library\", (req, res) => {\\
      res.send(\`<!DOCTYPE html>\\
<html lang=\"en\">\\
<head>\\
    <meta charset=\"UTF-8\">\\
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\\
    <title>Goblin Video Library - \\\${this.goblinId}</title>\\
    <link href=\"https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css\" rel=\"stylesheet\">\\
    <link rel=\"stylesheet\" href=\"https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css\">\\
    <style>body{background:#1a1a1a;color:#fff}.video-card{background:#2a2a2a;border:1px solid #444;transition:transform .2s}.video-card:hover{transform:translateY(-5px);border-color:#ff6b00}.video-thumbnail{width:100%;height:200px;object-fit:cover;background:#000}.play-btn{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:3rem;color:#ff6b00;opacity:.8}.video-card:hover .play-btn{opacity:1}</style>\\
</head>\\
<body>\\
    <nav class=\"navbar navbar-dark bg-dark\"><div class=\"container-fluid\"><span class=\"navbar-brand\"><i class=\"bi bi-film\"></i> Goblin Video Library - \\\${this.goblinId}</span><button class=\"btn btn-outline-warning\" onclick=\"location.reload()\"><i class=\"bi bi-arrow-clockwise\"></i> Refresh</button></div></nav>\\
    <div class=\"container-fluid py-4\"><div class=\"row mb-3\"><div class=\"col\"><h4><i class=\"bi bi-collection-play\"></i> Local Videos</h4><p class=\"text-muted\">Videos stored on this Goblin</p></div></div><div id=\"videoGrid\" class=\"row g-3\"><div class=\"col-12 text-center\"><div class=\"spinner-border text-warning\" role=\"status\"><span class=\"visually-hidden\">Loading...</span></div></div></div></div>\\
    <script>async function loadVideos(){try{const r=await fetch(\"/video-library/api/videos\");const d=await r.json();const g=document.getElementById(\"videoGrid\");if(!d.success||!d.videos||d.videos.length===0){g.innerHTML='<div class=\"col-12 text-center text-muted\"><h5>No videos found</h5></div>';return}g.innerHTML=d.videos.map(v=>\\\`<div class=\"col-md-6 col-lg-4 col-xl-3\"><div class=\"card video-card\"><div class=\"position-relative\"><div class=\"video-thumbnail d-flex align-items-center justify-content-center\"><i class=\"bi bi-film\" style=\"font-size:4rem;color:#666\"></i></div><i class=\"bi bi-play-circle-fill play-btn\"></i></div><div class=\"card-body\"><h6 class=\"card-title text-truncate\" title=\"\\\${v.name}\">\\\${v.name}</h6><p class=\"card-text small text-muted\"><i class=\"bi bi-file-earmark-play\"></i> \\\${v.size}<br><i class=\"bi bi-folder\"></i> \\\${v.category||\"Uncategorized\"}</p><button class=\"btn btn-sm btn-warning w-100\" onclick=\"playVideo('\\\${v.path}','\\\${v.name}')\"><i class=\"bi bi-play-fill\"></i> Play</button></div></div></div>\\\`).join(\"\")}catch(e){console.error(\"Error loading videos:\",e);document.getElementById(\"videoGrid\").innerHTML='<div class=\"col-12 text-center text-danger\"><h5>Error loading videos</h5></div>'}}async function playVideo(p,n){try{const r=await fetch(\"/play-video\",{method:\"POST\",headers:{\"Content-Type\":\"application/json\"},body:JSON.stringify({filename:p,loop:false})});const d=await r.json();if(d.success){alert(\"Now playing: \"+n)}else{alert(\"Failed to play video: \"+d.error)}}catch(e){alert(\"Error playing video: \"+e.message)}}loadVideos()</script>\\
</body>\\
</html>\\\`);});\\
\\
    this.app.get(\"/video-library/api/videos\", async (req, res) => {try{const videoDir = path.join(__dirname, \"media\", \"video\");const videos = await this.scanVideoDirectory(videoDir);res.json({success: true,videos: videos,count: videos.length});}catch(error){res.status(500).json({success: false,error: error.message});}});\\
' /home/remote/goblin/server.js
    "
    
    # Add the scanVideoDirectory helper method before the handleMonsterBoxConnection method
    sshpass -p "$PASSWORD" ssh remote@$IP "
        sed -i '/handleMonsterBoxConnection(host, port)/i\\
  async scanVideoDirectory(dir, category = \"\") {\\
    const videos = [];\\
    try {\\
      const entries = await fs.readdir(dir, { withFileTypes: true });\\
      for (const entry of entries) {\\
        const fullPath = path.join(dir, entry.name);\\
        if (entry.isDirectory()) {\\
          const subVideos = await this.scanVideoDirectory(fullPath, entry.name);\\
          videos.push(...subVideos);\\
        } else if (entry.isFile() && /\\.(mp4|avi|mkv|mov)$/i.test(entry.name)) {\\
          const stats = await fs.stat(fullPath);\\
          const relativePath = fullPath.replace(path.join(__dirname, \"media\", \"video\") + path.sep, \"\");\\
          videos.push({\\
            name: entry.name,\\
            path: relativePath,\\
            category: category,\\
            size: (stats.size / (1024 * 1024)).toFixed(2) + \" MB\",\\
            modified: stats.mtime\\
          });\\
        }\\
      }\\
    } catch (error) {\\
      console.error(\"Error scanning video directory:\", error);\\
    }\\
    return videos;\\
  }\\
\\
' /home/remote/goblin/server.js
    "
    
    # Restart the goblin service
    echo "🔄 Restarting $NAME service..."
    sshpass -p "$PASSWORD" ssh remote@$IP "sudo systemctl restart goblin"
    
    echo "✅ $NAME updated successfully!"
}

# Add to both goblins
add_to_goblin "$GOBLIN1_IP" "Goblin 1"
add_to_goblin "$GOBLIN2_IP" "Goblin 2"

echo ""
echo "🎉 Video Library endpoints added to both Goblins!"
echo ""
echo "📺 Access the video libraries at:"
echo "   Goblin 1: http://$GOBLIN1_IP:3001/video-library"
echo "   Goblin 2: http://$GOBLIN2_IP:3001/video-library"
echo ""
echo "✅ Done!"

