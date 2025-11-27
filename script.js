// 1. Variável que vai receber os dados do JSON
let escolasDB = [];

// 2. Carrega o JSON assim que o script roda
fetch('escolas.json')
    .then(response => response.json())
    .then(data => {
        escolasDB = data;
        console.log("Base de dados carregada:", escolasDB.length, "escolas.");
    })
    .catch(error => console.error("Erro ao carregar escolas.json:", error));

// --- LÓGICA ---

let totalFilhos = 1;
let filhoAtual = 1;
let dadosFilhos = [];
let configTemp = {};
let historyStack = ['q1']; 

function navigateTo(nextId) {
    const currentId = historyStack[historyStack.length - 1];
    document.getElementById(currentId).classList.remove('active');
    document.getElementById(currentId).classList.add('leaving');

    setTimeout(() => {
        document.getElementById(currentId).style.display = 'none';
        document.getElementById(currentId).classList.remove('leaving');
        const nextEl = document.getElementById(nextId);
        nextEl.style.display = 'block';
        if(nextId.startsWith('tpl-')) {
            document.querySelectorAll('.lbl-num').forEach(span => span.innerText = filhoAtual);
        }
        setTimeout(() => nextEl.classList.add('active'), 50);
    }, 400);

    historyStack.push(nextId);
}

function goBack() {
    if (historyStack.length <= 1) return;
    const currentId = historyStack.pop(); 
    const prevId = historyStack[historyStack.length - 1]; 

    if (currentId === 'tpl-tipo' && prevId === 'tpl-transporte') {
        filhoAtual--;
        dadosFilhos.pop(); 
    } else if (currentId === 'q-cep' && prevId === 'tpl-transporte') {
        dadosFilhos.pop(); 
    }

    document.getElementById(currentId).classList.remove('active');
    document.getElementById(currentId).style.display = 'none';
    const prevEl = document.getElementById(prevId);
    prevEl.style.display = 'block';
    if(prevId.startsWith('tpl-')) {
        document.querySelectorAll('.lbl-num').forEach(span => span.innerText = filhoAtual);
    }
    setTimeout(() => prevEl.classList.add('active'), 50);
}

function startFlow() {
    totalFilhos = parseInt(document.getElementById('inputQtd').value);
    if (totalFilhos < 1) totalFilhos = 1;
    filhoAtual = 1;
    dadosFilhos = [];
    navigateTo('tpl-tipo');
}

function saveConfig(key, value) {
    configTemp[key] = value;
    if (key === 'tipo') navigateTo('tpl-nivel');
    else if (key === 'nivel') navigateTo('tpl-transporte');
    else if (key === 'transporte') {
        configTemp.id = filhoAtual;
        dadosFilhos.push({...configTemp});
        configTemp = {};
        if (filhoAtual < totalFilhos) {
            filhoAtual++;
            navigateTo('tpl-tipo');
        } else {
            if(totalFilhos > 1) document.getElementById('div-mesma-escola').style.display = 'block';
            navigateTo('q-cep');
        }
    }
}

async function finalizar() {
    // Verifica se o JSON carregou
    if (escolasDB.length === 0) {
        alert("Aguarde, carregando base de dados das escolas...");
        return;
    }

    const cep = document.getElementById('inputCep').value.replace(/\D/g, '');
    if (cep.length !== 8) { alert('CEP inválido'); return; }
    document.getElementById('loading-msg').style.display = 'block';
    try {
        const coords = await obterLatLon(cep);
        renderizarResultados(coords.lat, coords.lon);
    } catch (e) {
        alert("Erro ao buscar CEP ou conectar ao serviço.");
        document.getElementById('loading-msg').style.display = 'none';
    }
}

async function obterLatLon(cep) {
    try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=Brazil+${cep}&limit=1`);
        const d = await r.json();
        if (d.length > 0) return { lat: parseFloat(d[0].lat), lon: parseFloat(d[0].lon) };
    } catch(e) {}
    const r2 = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`);
    const d2 = await r2.json();
    return { lat: d2.location.coordinates.latitude, lon: d2.location.coordinates.longitude };
}

function renderizarResultados(latUser, lngUser) {
    const checkMesma = document.getElementById('checkMesma').checked;
    const container = document.getElementById('results-container');
    container.innerHTML = '';

    let listaFinal = [];
    dadosFilhos.forEach(filho => {
        let candidatas = escolasDB.filter(e => {
            const tipoMatch = (filho.tipo === 'ambos') || (e.type === filho.tipo);
            const nivelMatch = e.levels.includes(filho.nivel);
            return tipoMatch && nivelMatch;
        });
        candidatas = candidatas.map(e => ({...e, dist: getDistancia(latUser, lngUser, e.lat, e.lng)}));
        candidatas.sort((a,b) => a.dist - b.dist);
        listaFinal.push({ filho: filho, opcoes: candidatas });
    });

    let escolaComum = null;
    let conflito = false;
    if (checkMesma && totalFilhos > 1) {
        let ids = listaFinal[0].opcoes.map(e => e.id);
        for(let i=1; i<listaFinal.length; i++) {
            let idsOutro = listaFinal[i].opcoes.map(e => e.id);
            ids = ids.filter(id => idsOutro.includes(id));
        }
        if(ids.length > 0) escolaComum = escolasDB.find(e => e.id === ids[0]);
        else conflito = true;
    }

    document.getElementById('result-screen').style.display = 'block';
    
    const mapa = L.map('mapa').setView([latUser, lngUser], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapa);
    const layerGroup = L.layerGroup().addTo(mapa);
    L.marker([latUser, lngUser]).addTo(layerGroup).bindPopup("Sua Casa").openPopup();

    if (conflito) {
        container.innerHTML += `<div style="padding:15px; background:#fff5f5; color:#c53030; border-radius:8px; margin-bottom:15px; text-align:center;">⚠️ Conflito de logística: Mostrando melhores opções individuais.</div>`;
    } else if (escolaComum) {
            container.innerHTML += `<div style="padding:15px; background:#f0fff4; color:#276749; border-radius:8px; margin-bottom:15px; text-align:center;">✅ Sucesso: Escola comum encontrada!</div>`;
    }

    listaFinal.forEach(item => {
        let escolha = (escolaComum && !conflito) ? escolaComum : item.opcoes[0];
        if(!escolha) {
            container.innerHTML += `<div class="child-result"><strong>Criança ${item.filho.id}:</strong> Nenhuma escola encontrada.</div>`;
            return;
        }

        const idCar = `car-${item.filho.id}`;
        const idWalk = `walk-${item.filho.id}`;
        const idDist = `dist-${item.filho.id}`;

        const html = `
            <div class="child-result">
                <h3 style="margin:0; color:#2d3748;">🧒 Criança ${item.filho.id} <small>(${item.filho.nivel})</small></h3>
                <div style="font-size:1.1rem; font-weight:bold; color:#3182ce; margin:5px 0;">${escolha.nome}</div>
                
                <div class="data-grid">
                    <div class="data-item">
                        <span class="data-label">Distância Linear</span>
                        <span class="data-value">${getDistancia(latUser, lngUser, escolha.lat, escolha.lng).toFixed(2)} km</span>
                    </div>
                    <div class="data-item">
                        <span class="data-label">Distância (Via Pública)</span>
                        <span class="data-value" id="${idDist}"><span class="loading">...</span></span>
                    </div>
                    <div class="data-item" style="${item.filho.transporte === 'car' ? 'background:#ebf8ff; border:1px solid #bee3f8;' : ''}">
                        <span class="data-label">Tempo Carro 🚗</span>
                        <span class="data-value" id="${idCar}"><span class="loading">...</span></span>
                    </div>
                    <div class="data-item" style="${item.filho.transporte === 'foot' ? 'background:#ebf8ff; border:1px solid #bee3f8;' : ''}">
                        <span class="data-label">Tempo A Pé 🚶</span>
                        <span class="data-value" id="${idWalk}"><span class="loading">...</span></span>
                    </div>
                </div>
            </div>
        `;
        container.innerHTML += html;

        L.marker([escolha.lat, escolha.lng]).addTo(layerGroup).bindPopup(escolha.nome);
        const estiloLinha = item.filho.transporte === 'car' ? {color:'#3182ce', weight:4} : {color:'#3182ce', dashArray:'5,10', weight:4};
        
        if(!escolaComum || item.filho.id === 1) { 
                L.Routing.control({
                waypoints: [L.latLng(latUser, lngUser), L.latLng(escolha.lat, escolha.lng)],
                serviceUrl: 'https://router.project-osrm.org/route/v1',
                lineOptions: { styles: [estiloLinha] },
                createMarker: function() { return null; },
                addWaypoints: false, draggableWaypoints: false, fitSelectedRoutes: true, show: false
            }).addTo(mapa);
        }

        fetchDadosCompletos(latUser, lngUser, escolha.lat, escolha.lng, idCar, idWalk, idDist);
    });
}

function fetchDadosCompletos(lat1, lng1, lat2, lng2, idCar, idWalk, idDist) {
    // 1. ROTA DE CARRO (Para pegar distância real e tempo de carro)
    fetch(`https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=false`)
        .then(r => r.json())
        .then(d => {
            if(d.routes && d.routes.length) {
                const distKm = (d.routes[0].distance / 1000).toFixed(1);
                const tempoCarroMin = Math.round(d.routes[0].duration / 60);
                
                document.getElementById(idDist).innerText = distKm + " km";
                document.getElementById(idCar).innerText = tempoCarroMin + " min";

                // 2. MATEMÁTICA PARA TEMPO A PÉ
                // (Distância Real / 4 km/h) * 60 min
                // resolvi fazer o cáculo da distância a pé forçada.
                const tempoPeCalc = Math.round((parseFloat(distKm) / 4) * 60);
                document.getElementById(idWalk).innerText = "~" + tempoPeCalc + " min";
            }
        });
}

function getDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const a = Math.sin((lat2-lat1)*Math.PI/360)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin((lon2-lon1)*Math.PI/360)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
