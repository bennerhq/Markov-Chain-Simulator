let nodes = [];
let edges = [];
let transitionMatrix = [];
let currentNode = 0;
let simulationRunning = false;
let animationId;
let nodeVisits = [];
let totalSteps = 0;
let nextNodeId = 0;

// Mouse/Touch interaction variables
let interactionMode = 'none'; // 'none', 'add', 'remove', 'addNode', 'deleteNode'
let selectedNode = null;

// Drag and drop variables
let isDragging = false;
let dragNodeIndex = -1;
let dragOffset = { x: 0, y: 0 };
let lastTouchTime = 0;
let touchStartTime = 0;

// Modern color palette for nodes
const nodeColors = [
    '#4f46e5', // Indigo
    '#06b6d4', // Cyan
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#ef4444', // Red
    '#8b5cf6', // Violet
    '#f97316', // Orange
    '#84cc16', // Lime
    '#ec4899', // Pink
    '#6b7280'  // Gray
];

function saveMarkovChain() {
    const markovChainData = {
        version: "1.0",
        timestamp: new Date().toISOString(),
        nodes: nodes.map(node => ({
            id: node.id,
            x: node.x,
            y: node.y,
            color: node.color
        })),
        transitionMatrix: transitionMatrix.map(row => [...row]),
        currentNode: currentNode,
        nodeVisits: [...nodeVisits],
        totalSteps: totalSteps,
        nextNodeId: nextNodeId
    };

    const dataStr = JSON.stringify(markovChainData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `markov_chain_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    showFileStatus('Markov chain saved successfully!', 'success');
}

function loadMarkovChain(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.name.toLowerCase().endsWith('.json')) {
        showFileStatus('Error: Please select a JSON file.', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const markovChainData = JSON.parse(e.target.result);
            
            // Validate the loaded data
            if (!validateMarkovChainData(markovChainData)) {
                showFileStatus('Error: Invalid Markov chain file format.', 'error');
                return;
            }
            
            // Stop any running simulation
            stopSimulation();
            
            // Load the data
            nodes = markovChainData.nodes.map(node => ({
                id: node.id,
                x: node.x,
                y: node.y,
                color: node.color
            }));
            
            transitionMatrix = markovChainData.transitionMatrix.map(row => [...row]);
            currentNode = markovChainData.currentNode || 0;
            nodeVisits = [...(markovChainData.nodeVisits || new Array(nodes.length).fill(0))];
            totalSteps = markovChainData.totalSteps || 0;
            nextNodeId = markovChainData.nextNodeId || nodes.length;
            
            // Ensure currentNode is valid
            if (currentNode >= nodes.length) {
                currentNode = 0;
            }
            
            // Update UI
            document.getElementById('nodeCount').value = nodes.length;
            createMatrixTable();
            validateMatrix();
            updateStatisticsDisplay();
            updateVisualization();
            setMode('none');
            
            showFileStatus(`Markov chain loaded successfully! (${nodes.length} nodes)`, 'success');
            
        } catch (error) {
            console.error('Error loading file:', error);
            showFileStatus('Error: Could not parse JSON file.', 'error');
        }
    };
    
    reader.readAsText(file);
    
    // Clear the file input so the same file can be loaded again
    event.target.value = '';
}

function validateMarkovChainData(data) {
    // Check required fields
    if (!data.nodes || !Array.isArray(data.nodes) || data.nodes.length === 0) {
        return false;
    }
    
    if (!data.transitionMatrix || !Array.isArray(data.transitionMatrix)) {
        return false;
    }
    
    // Check that matrix dimensions match node count
    const nodeCount = data.nodes.length;
    if (data.transitionMatrix.length !== nodeCount) {
        return false;
    }
    
    // Check that each row has the correct length
    for (let i = 0; i < nodeCount; i++) {
        if (!Array.isArray(data.transitionMatrix[i]) || 
            data.transitionMatrix[i].length !== nodeCount) {
            return false;
        }
        
        // Check that all values are numbers
        for (let j = 0; j < nodeCount; j++) {
            if (typeof data.transitionMatrix[i][j] !== 'number' || 
                isNaN(data.transitionMatrix[i][j]) ||
                data.transitionMatrix[i][j] < 0) {
                return false;
            }
        }
    }
    
    // Check node structure
    for (const node of data.nodes) {
        if (typeof node.id !== 'number' ||
            typeof node.x !== 'number' ||
            typeof node.y !== 'number' ||
            typeof node.color !== 'string') {
            return false;
        }
    }
    
    return true;
}

function showFileStatus(message, type) {
    const statusDiv = document.getElementById('fileStatus');
    statusDiv.textContent = message;
    statusDiv.className = type;
    
    // Clear the message after 5 seconds
    setTimeout(() => {
        statusDiv.textContent = '';
        statusDiv.className = '';
    }, 5000);
}

function setMode(mode) {
    interactionMode = mode;
    selectedNode = null;
    updateModeIndicator();
    updateVisualization(); // Refresh to remove selection highlights
}

function updateModeIndicator() {
    const indicator = document.getElementById('modeIndicator');
    const addBtn = document.getElementById('addModeBtn');
    const removeBtn = document.getElementById('removeModeBtn');
    const addNodeBtn = document.getElementById('addNodeModeBtn');
    const deleteNodeBtn = document.getElementById('deleteNodeModeBtn');
    const normalBtn = document.getElementById('normalModeBtn');
    
    // Reset button styles
    [addBtn, removeBtn, addNodeBtn, deleteNodeBtn, normalBtn].forEach(btn => {
        btn.style.background = '#404040';
    });
    
    switch(interactionMode) {
        case 'add':
            indicator.textContent = 'Add Edge Mode - Touch first node, then second node to create edge';
            indicator.className = 'mode-indicator add-mode';
            addBtn.style.background = '#2d5a2d';
            break;
        case 'remove':
            indicator.textContent = 'Remove Edge Mode - Touch on edges to remove them';
            indicator.className = 'mode-indicator remove-mode';
            removeBtn.style.background = '#5d1a1a';
            break;
        case 'addNode':
            indicator.textContent = 'Add Node Mode - Touch on empty canvas area to create a new node';
            indicator.className = 'mode-indicator add-node-mode';
            addNodeBtn.style.background = '#1e3a8a';
            break;
        case 'deleteNode':
            indicator.textContent = 'Delete Node Mode - Touch on nodes to delete them (minimum 2 nodes required)';
            indicator.className = 'mode-indicator delete-node-mode';
            deleteNodeBtn.style.background = '#7c2d12';
            break;
        default:
            indicator.textContent = 'Normal Mode - Touch edges to remove, touch nodes to add edges, drag nodes to move them';
            indicator.className = 'mode-indicator';
            normalBtn.style.background = '#2d5a2d';
            break;
    }
}

function getEventPosition(event) {
    const canvas = document.getElementById('canvas');
    const rect = canvas.getBoundingClientRect();
    
    // Handle both mouse and touch events
    let clientX, clientY;
    if (event.touches && event.touches.length > 0) {
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
    } else if (event.changedTouches && event.changedTouches.length > 0) {
        clientX = event.changedTouches[0].clientX;
        clientY = event.changedTouches[0].clientY;
    } else {
        clientX = event.clientX;
        clientY = event.clientY;
    }
    
    // Convert to SVG coordinates
    const scaleX = 800 / rect.width;
    const scaleY = 600 / rect.height;
    
    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
}

function handleStart(event) {
    if (simulationRunning) return;
    
    event.preventDefault(); // Prevent default touch behavior
    touchStartTime = Date.now();
    
    const pos = getEventPosition(event);
    
    // Only enable dragging in normal mode or when not in add/remove modes
    if (interactionMode === 'none') {
        // Check if touching a node for dragging
        for (let i = 0; i < nodes.length; i++) {
            const distance = Math.sqrt(
                (pos.x - nodes[i].x) ** 2 + (pos.y - nodes[i].y) ** 2
            );
            
            if (distance <= 25) { // Within node radius
                isDragging = true;
                dragNodeIndex = i;
                dragOffset.x = pos.x - nodes[i].x;
                dragOffset.y = pos.y - nodes[i].y;
                
                // Update cursor for dragging
                const nodeElement = document.getElementById(`node-${i}`);
                if (nodeElement) {
                    nodeElement.classList.add('dragging');
                }
                
                return;
            }
        }
    }
    
    // If not dragging, handle other interactions
    handleInteraction(event);
}

function handleMove(event) {
    if (!isDragging || dragNodeIndex === -1) return;
    
    event.preventDefault();
    const pos = getEventPosition(event);
    
    // Calculate new position (account for drag offset)
    let newX = pos.x - dragOffset.x;
    let newY = pos.y - dragOffset.y;
    
    // Keep node within canvas bounds
    const nodeRadius = 25;
    newX = Math.max(nodeRadius, Math.min(800 - nodeRadius, newX));
    newY = Math.max(nodeRadius, Math.min(600 - nodeRadius, newY));
    
    // Update node position
    nodes[dragNodeIndex].x = newX;
    nodes[dragNodeIndex].y = newY;
    
    // Update visualization
    updateVisualization();
}

function handleEnd(event) {
    if (isDragging && dragNodeIndex !== -1) {
        event.preventDefault();
        
        // Remove dragging class
        const nodeElement = document.getElementById(`node-${dragNodeIndex}`);
        if (nodeElement) {
            nodeElement.classList.remove('dragging');
        }
        
        isDragging = false;
        dragNodeIndex = -1;
        return;
    }
    
    // Handle tap/click if it wasn't a drag
    const touchEndTime = Date.now();
    const touchDuration = touchEndTime - touchStartTime;
    
    // Consider it a tap if the touch was short
    if (touchDuration < 300) {
        handleInteraction(event);
    }
}

function handleInteraction(event) {
    if (simulationRunning || isDragging) return;
    
    const pos = getEventPosition(event);
    
    if (interactionMode === 'addNode') {
        // Check if tap is not too close to existing nodes
        const minDistance = 60;
        let tooClose = false;
        
        for (const node of nodes) {
            const distance = Math.sqrt((pos.x - node.x) ** 2 + (pos.y - node.y) ** 2);
            if (distance < minDistance) {
                tooClose = true;
                break;
            }
        }
        
        if (!tooClose && pos.x > 30 && pos.x < 770 && pos.y > 30 && pos.y < 570) {
            addNewNode(pos.x, pos.y);
        }
        return;
    }
    
    // Check if tapping on a node
    for (let i = 0; i < nodes.length; i++) {
        const distance = Math.sqrt((pos.x - nodes[i].x) ** 2 + (pos.y - nodes[i].y) ** 2);
        if (distance <= 25) {
            handleNodeInteraction(i, event);
            return;
        }
    }
    
    // Check if tapping on an edge
    handleEdgeInteraction(pos, event);
}

function addNewNode(x, y) {
    const newNode = {
        id: nextNodeId++,
        x: x,
        y: y,
        color: nodeColors[nodes.length % nodeColors.length]
    };
    
    nodes.push(newNode);
    
    // Expand transition matrix
    const newSize = nodes.length;
    
    // Add new row and column to matrix
    for (let i = 0; i < newSize - 1; i++) {
        transitionMatrix[i].push(0); // Add column to existing rows
    }
    
    // Add new row
    const newRow = new Array(newSize).fill(0);
    newRow[newSize - 1] = 1; // Self-loop for new node
    transitionMatrix.push(newRow);
    
    // Update node visits array
    nodeVisits.push(0);
    
    // Update node count input and recreate matrix table
    document.getElementById('nodeCount').value = nodes.length;
    createMatrixTable();
    validateMatrix();
    updateVisualization();
}

function handleNodeInteraction(nodeIndex, event) {
    if (simulationRunning || isDragging) return;
    
    if (interactionMode === 'deleteNode') {
        if (nodes.length <= 2) {
            alert('Cannot delete node: minimum 2 nodes required');
            return;
        }
        deleteNode(nodeIndex);
        return;
    }
    
    if (interactionMode === 'add' || interactionMode === 'none') {
        if (selectedNode === null) {
            selectedNode = nodeIndex;
            updateVisualization();
        } else {
            // Add edge from selectedNode to nodeIndex
            addEdge(selectedNode, nodeIndex);
            selectedNode = null;
            updateVisualization();
        }
    }
    
    event.stopPropagation();
}

function deleteNode(nodeIndex) {
    if (nodeIndex === currentNode) {
        currentNode = 0; // Reset to first node
    } else if (nodeIndex < currentNode) {
        currentNode--; // Adjust current node index
    }
    
    // Remove node from array
    nodes.splice(nodeIndex, 1);
    
    // Remove row and column from transition matrix
    transitionMatrix.splice(nodeIndex, 1);
    for (let i = 0; i < transitionMatrix.length; i++) {
        transitionMatrix[i].splice(nodeIndex, 1);
    }
    
    // Remove from node visits
    nodeVisits.splice(nodeIndex, 1);
    
    // Update node IDs to be sequential
    for (let i = 0; i < nodes.length; i++) {
        nodes[i].id = i;
    }
    
    // Update node count input and recreate matrix table
    document.getElementById('nodeCount').value = nodes.length;
    createMatrixTable();
    validateMatrix();
    updateStatisticsDisplay();
    updateVisualization();
}

function handleEdgeInteraction(pos, event) {
    if (simulationRunning || isDragging) return;
    
    if (interactionMode === 'remove' || interactionMode === 'none') {
        // Check if tapping near an edge
        for (let i = 0; i < nodes.length; i++) {
            for (let j = 0; j < nodes.length; j++) {
                if (transitionMatrix[i][j] > 0) {
                    if (isNearEdge(pos, nodes[i], nodes[j], i === j)) {
                        removeEdge(i, j);
                        return;
                    }
                }
            }
        }
    }
}

function isNearEdge(pos, from, to, isSelfLoop) {
    const threshold = 30; // Touch-friendly threshold
    
    if (isSelfLoop) {
        // Check if near self-loop
        const centerX = from.x + 45;
        const centerY = from.y - 35;
        const distance = Math.sqrt((pos.x - centerX) ** 2 + (pos.y - centerY) ** 2);
        return distance <= threshold;
    } else {
        // Check if near edge curve
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const unitX = dx / distance;
        const unitY = dy / distance;
        
        const fromX = from.x + unitX * 25;
        const fromY = from.y + unitY * 25;
        const toX = to.x - unitX * 25;
        const toY = to.y - unitY * 25;

        const midX = (fromX + toX) / 2;
        const midY = (fromY + toY) / 2;
        
        const perpX = -unitY;
        const perpY = unitX;
        const curveOffset = 30;
        const controlX = midX + perpX * curveOffset;
        const controlY = midY + perpY * curveOffset;

        // Check multiple points along the curve
        for (let t = 0; t <= 1; t += 0.1) {
            const x = (1-t)*(1-t)*fromX + 2*(1-t)*t*controlX + t*t*toX;
            const y = (1-t)*(1-t)*fromY + 2*(1-t)*t*controlY + t*t*toY;
            const dist = Math.sqrt((pos.x - x) ** 2 + (pos.y - y) ** 2);
            if (dist <= threshold) {
                return true;
            }
        }
    }
    return false;
}

function addEdge(fromIndex, toIndex) {
    if (transitionMatrix[fromIndex][toIndex] === 0) {
        transitionMatrix[fromIndex][toIndex] = 0.5; // Default probability
        createMatrixTable();
        validateMatrix();
        updateVisualization();
    }
}

function removeEdge(fromIndex, toIndex) {
    if (transitionMatrix[fromIndex][toIndex] > 0) {
        transitionMatrix[fromIndex][toIndex] = 0;
        createMatrixTable();
        validateMatrix();
        updateVisualization();
    }
}

function generateChain() {
    const nodeCount = parseInt(document.getElementById('nodeCount').value);
    
    // Initialize nodes
    nodes = [];
    nextNodeId = 0;
    const centerX = 400;
    const centerY = 300;
    const radius = 200;

    // Generate nodes in circle
    for (let i = 0; i < nodeCount; i++) {
        const angle = (2 * Math.PI * i) / nodeCount;
        nodes.push({
            id: nextNodeId++,
            x: centerX + radius * Math.cos(angle),
            y: centerY + radius * Math.sin(angle),
            color: nodeColors[i % nodeColors.length]
        });
    }

    // Initialize transition matrix
    initializeMatrix(nodeCount);
    createMatrixTable();
    resetStatistics();
    setMode('none');
    updateVisualization();
}

function initializeMatrix(nodeCount) {
    transitionMatrix = [];
    for (let i = 0; i < nodeCount; i++) {
        transitionMatrix[i] = [];
        let sum = 0;
        for (let j = 0; j < nodeCount; j++) {
            transitionMatrix[i][j] = Math.random();
            sum += transitionMatrix[i][j];
        }
        // Normalize to make row sum = 1
        for (let j = 0; j < nodeCount; j++) {
            transitionMatrix[i][j] /= sum;
        }
    }
}

function resetStatistics() {
    nodeVisits = new Array(nodes.length).fill(0);
    totalSteps = 0;
    currentNode = 0;
    // Count the initial position
    nodeVisits[0] = 1;
    updateStatisticsDisplay();
}

function updateStatisticsDisplay() {
    const container = document.getElementById('statisticsContainer');
    
    let html = '<table class="stats-table"><thead><tr>';
    html += '<th>Node</th><th>Visits</th><th>Percentage</th></tr></thead><tbody>';
    
    const total = Math.max(1, nodeVisits.reduce((sum, visits) => sum + visits, 0));
    
    for (let i = 0; i < nodes.length; i++) {
        const percentage = ((nodeVisits[i] / total) * 100).toFixed(1);
        html += `<tr>
            <td>Node ${i}</td>
            <td id="visits_${i}">${nodeVisits[i]}</td>
            <td id="percentage_${i}">${percentage}%</td>
        </tr>`;
    }
    
    html += '</tbody></table>';
    container.innerHTML = html;
    
    document.getElementById('totalSteps').textContent = totalSteps;
}

function createMatrixTable() {
    const container = document.getElementById('matrixContainer');
    const nodeCount = nodes.length;
    
    let html = '<table class="matrix-table"><thead><tr><th>From \\ To</th>';
    
    // Column headers
    for (let j = 0; j < nodeCount; j++) {
        html += `<th>Node ${j}</th>`;
    }
    html += '<th>Row Sum</th></tr></thead><tbody>';
    
    // Matrix rows
    for (let i = 0; i < nodeCount; i++) {
        html += `<tr><th>Node ${i}</th>`;
        for (let j = 0; j < nodeCount; j++) {
            html += `<td><input type="number" class="matrix-input" 
                     id="matrix_${i}_${j}" value="${transitionMatrix[i][j].toFixed(3)}" 
                     min="0" max="1" step="0.001" onchange="updateMatrix(${i}, ${j})"></td>`;
        }
        html += `<td class="row-sum" id="sum_${i}">${calculateRowSum(i).toFixed(3)}</td>`;
        html += '</tr>';
    }
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

function updateMatrix(i, j) {
    const input = document.getElementById(`matrix_${i}_${j}`);
    const value = parseFloat(input.value);
    
    if (isNaN(value) || value < 0) {
        input.value = transitionMatrix[i][j].toFixed(3);
        return;
    }
    
    transitionMatrix[i][j] = value;
    updateRowSum(i);
    validateMatrix();
    updateVisualization();
}

function updateRowSum(row) {
    const sum = calculateRowSum(row);
    document.getElementById(`sum_${row}`).textContent = sum.toFixed(3);
    
    // Highlight invalid rows
    const sumElement = document.getElementById(`sum_${row}`);
    if (Math.abs(sum - 1.0) > 0.001) {
        sumElement.style.backgroundColor = '#5d1a1a';
    } else {
        sumElement.style.backgroundColor = '#2d5a2d';
    }
}

function calculateRowSum(row) {
    return transitionMatrix[row].reduce((sum, val) => sum + val, 0);
}

function validateMatrix() {
    const errorDiv = document.getElementById('matrixError');
    let isValid = true;
    
    for (let i = 0; i < transitionMatrix.length; i++) {
        const sum = calculateRowSum(i);
        if (Math.abs(sum - 1.0) > 0.001) {
            isValid = false;
            break;
        }
    }
    
    if (!isValid) {
        errorDiv.textContent = 'Warning: Row sums should equal 1.0 for valid probabilities';
    } else {
        errorDiv.textContent = '';
    }
    
    return isValid;
}

function normalizeMatrix() {
    for (let i = 0; i < transitionMatrix.length; i++) {
        const sum = calculateRowSum(i);
        if (sum > 0) {
            for (let j = 0; j < transitionMatrix[i].length; j++) {
                transitionMatrix[i][j] /= sum;
                document.getElementById(`matrix_${i}_${j}`).value = transitionMatrix[i][j].toFixed(3);
            }
        }
        updateRowSum(i);
    }
    validateMatrix();
    updateVisualization();
}

function randomizeMatrix() {
    initializeMatrix(nodes.length);
    createMatrixTable();
    updateVisualization();
}

function updateVisualization() {
    const canvas = document.getElementById('canvas');
    
    // Clear canvas except defs
    const defsContent = canvas.querySelector('defs').outerHTML;
    canvas.innerHTML = defsContent;

    // Draw edges with labels
    for (let i = 0; i < nodes.length; i++) {
        for (let j = 0; j < nodes.length; j++) {
            if (transitionMatrix[i][j] > 0) {
                drawEdge(nodes[i], nodes[j], i === j, transitionMatrix[i][j], i, j);
            }
        }
    }

    // Draw nodes
    nodes.forEach((node, i) => {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', node.x);
        circle.setAttribute('cy', node.y);
        circle.setAttribute('r', 25);
        circle.setAttribute('class', 'node' + (selectedNode === i ? ' selected' : ''));
        circle.setAttribute('fill', node.color);
        circle.setAttribute('id', `node-${i}`);
        canvas.appendChild(circle);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', node.x);
        text.setAttribute('y', node.y);
        text.setAttribute('class', 'node-label');
        text.textContent = i;
        canvas.appendChild(text);
    });

    // Add touch/mouse event handlers to canvas
    canvas.addEventListener('touchstart', handleStart, { passive: false });
    canvas.addEventListener('touchmove', handleMove, { passive: false });
    canvas.addEventListener('touchend', handleEnd, { passive: false });
    canvas.addEventListener('mousedown', handleStart);
    canvas.addEventListener('mousemove', handleMove);
    canvas.addEventListener('mouseup', handleEnd);

    // Add simulation dot at center of current node
    if (nodes.length > 0) {
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', nodes[currentNode].x);
        dot.setAttribute('cy', nodes[currentNode].y);
        dot.setAttribute('r', 8);
        dot.setAttribute('class', 'dot');
        dot.setAttribute('id', 'simulation-dot');
        canvas.appendChild(dot);
    }
}

function drawEdge(from, to, isSelfLoop, probability, fromIndex, toIndex) {
    const canvas = document.getElementById('canvas');
    
    if (isSelfLoop) {
        // Draw self-loop
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = `M ${from.x + 25} ${from.y} 
                  Q ${from.x + 60} ${from.y - 40} ${from.x} ${from.y - 25}`;
        path.setAttribute('d', d);
        path.setAttribute('class', 'edge');
        path.setAttribute('stroke-width', Math.max(3, probability * 8));
        canvas.appendChild(path);

        // Add probability label for self-loop
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', from.x + 45);
        label.setAttribute('y', from.y - 35);
        label.setAttribute('class', 'edge-label');
        label.textContent = probability.toFixed(2);
        canvas.appendChild(label);
    } else {
        // Calculate edge position (from node edge to node edge)
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const unitX = dx / distance;
        const unitY = dy / distance;
        
        const fromX = from.x + unitX * 25;
        const fromY = from.y + unitY * 25;
        const toX = to.x - unitX * 25;
        const toY = to.y - unitY * 25;

        // Calculate control point for curve
        const midX = (fromX + toX) / 2;
        const midY = (fromY + toY) / 2;
        
        // Create perpendicular offset for curve
        const perpX = -unitY;
        const perpY = unitX;
        
        // Offset amount (adjust this value to control curve intensity)
        const curveOffset = 30;
        const controlX = midX + perpX * curveOffset;
        const controlY = midY + perpY * curveOffset;

        // Draw curved edge using quadratic Bezier curve
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = `M ${fromX} ${fromY} Q ${controlX} ${controlY} ${toX} ${toY}`;
        path.setAttribute('d', d);
        path.setAttribute('class', 'edge');
        path.setAttribute('stroke-width', Math.max(3, probability * 8));
        canvas.appendChild(path);

        // Add probability label at curve midpoint
        const t = 0.5;
        const labelX = (1-t)*(1-t)*fromX + 2*(1-t)*t*controlX + t*t*toX;
        const labelY = (1-t)*(1-t)*fromY + 2*(1-t)*t*controlY + t*t*toY;

        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', labelX);
        label.setAttribute('y', labelY);
        label.setAttribute('class', 'edge-label');
        label.textContent = probability.toFixed(2);
        canvas.appendChild(label);

        // Add dark background rectangle for better readability
        const bbox = label.getBBox();
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', bbox.x - 2);
        rect.setAttribute('y', bbox.y - 1);
        rect.setAttribute('width', bbox.width + 4);
        rect.setAttribute('height', bbox.height + 2);
        rect.setAttribute('fill', '#1a1a1a');
        rect.setAttribute('stroke', 'none');
        rect.setAttribute('opacity', '0.9');
        rect.setAttribute('class', 'edge-label-bg');
        canvas.insertBefore(rect, label);
    }
}

function startSimulation() {
    if (nodes.length === 0) {
        alert('Please generate a chain first!');
        return;
    }
    
    if (!validateMatrix()) {
        alert('Please fix the transition matrix first!');
        return;
    }
    
    simulationRunning = true;
    simulate();
}

function stopSimulation() {
    simulationRunning = false;
    if (animationId) {
        clearTimeout(animationId);
    }
}

function simulate() {
    if (!simulationRunning) return;

    // Choose next node based on transition probabilities
    const rand = Math.random();
    let cumSum = 0;
    let nextNode = currentNode;

    for (let i = 0; i < transitionMatrix[currentNode].length; i++) {
        cumSum += transitionMatrix[currentNode][i];
        if (rand <= cumSum) {
            nextNode = i;
            break;
        }
    }

    // Update statistics
    nodeVisits[nextNode]++;
    totalSteps++;
    updateStatisticsDisplay();

    // Animate dot movement
    animateDot(currentNode, nextNode);
    currentNode = nextNode;

    animationId = setTimeout(simulate, 1500);
}

function animateDot(fromIndex, toIndex) {
    const dot = document.getElementById('simulation-dot');
    const fromNode = nodes[fromIndex];
    const toNode = nodes[toIndex];
    
    if (fromIndex === toIndex) {
        // Self-loop animation - follow the self-loop path
        const centerX = fromNode.x;
        const centerY = fromNode.y;
        let progress = 0;
        const duration = 1000;
        const startTime = Date.now();

        function animateSelfLoop() {
            const elapsed = Date.now() - startTime;
            progress = Math.min(elapsed / duration, 1);
            
            // Follow the same path as the self-loop edge
            // Start from center, go to edge start, follow curve, return to center
            if (progress <= 0.1) {
                // Move from center to edge start
                const t = progress / 0.1;
                const x = centerX + t * 25;
                const y = centerY;
                dot.setAttribute('cx', x);
                dot.setAttribute('cy', y);
            } else if (progress <= 0.9) {
                // Follow the curve
                const t = (progress - 0.1) / 0.8;
                // Bezier curve: start(x+25, y), control(x+60, y-40), end(x, y-25)
                const startX = centerX + 25;
                const startY = centerY;
                const controlX = centerX + 60;
                const controlY = centerY - 40;
                const endX = centerX;
                const endY = centerY - 25;
                
                const x = (1-t)*(1-t)*startX + 2*(1-t)*t*controlX + t*t*endX;
                const y = (1-t)*(1-t)*startY + 2*(1-t)*t*controlY + t*t*endY;
                
                dot.setAttribute('cx', x);
                dot.setAttribute('cy', y);
            } else {
                // Move from edge end back to center
                const t = (progress - 0.9) / 0.1;
                const x = centerX + (1-t) * 0;
                const y = centerY - (1-t) * 25;
                dot.setAttribute('cx', x);
                dot.setAttribute('cy', y);
            }
            
            if (progress < 1) {
                requestAnimationFrame(animateSelfLoop);
            }
        }
        
        animateSelfLoop();
        return;
    }
    
    let progress = 0;
    const duration = 1000;
    const startTime = Date.now();

    // Calculate curve parameters for animation (matching the edge path exactly)
    const dx = toNode.x - fromNode.x;
    const dy = toNode.y - fromNode.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const unitX = dx / distance;
    const unitY = dy / distance;
    
    const fromX = fromNode.x + unitX * 25;
    const fromY = fromNode.y + unitY * 25;
    const toX = toNode.x - unitX * 25;
    const toY = toNode.y - unitY * 25;

    const midX = (fromX + toX) / 2;
    const midY = (fromY + toY) / 2;
    
    const perpX = -unitY;
    const perpY = unitX;
    const curveOffset = 30;
    const controlX = midX + perpX * curveOffset;
    const controlY = midY + perpY * curveOffset;

    function animate() {
        const elapsed = Date.now() - startTime;
        progress = Math.min(elapsed / duration, 1);
        
        let x, y;
        
        if (progress <= 0.1) {
            // Move from center to edge start
            const t = progress / 0.1;
            x = fromNode.x + t * (fromX - fromNode.x);
            y = fromNode.y + t * (fromY - fromNode.y);
        } else if (progress <= 0.9) {
            // Follow the Bezier curve path
            const t = (progress - 0.1) / 0.8;
            x = (1-t)*(1-t)*fromX + 2*(1-t)*t*controlX + t*t*toX;
            y = (1-t)*(1-t)*fromY + 2*(1-t)*t*controlY + t*t*toY;
        } else {
            // Move from edge end to center
            const t = (progress - 0.9) / 0.1;
            x = toX + t * (toNode.x - toX);
            y = toY + t * (toNode.y - toY);
        }
        
        dot.setAttribute('cx', x);
        dot.setAttribute('cy', y);
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        }
    }
    
    animate();
}

// Initialize with default chain
window.onload = function() {
    generateChain();
};
