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

// --- LÓGICA DE NAVEGAÇÃO ---

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
        console.error(e);
        alert("Erro ao buscar CEP. Verifique se digitou corretamente.");
        document.getElementById('loading-msg').style.display = 'none';
    }
}

async function obterLatLon(cep) {
    // Tenta BrasilAPI primeiro (mais rápido/preciso para BR)
    try {
        const r2 = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`);
        const d2 = await r2.json();
        if(d2.location && d2.location.coordinates) {
             return { lat: parseFloat(d2.location.coordinates.latitude), lon: parseFloat(d2.location.coordinates.longitude) };
        }
    } catch(e) {}

    // Fallback para OpenStreetMap
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=Brazil+${cep}&limit=1`);
    const d = await r.json();
    if (d.length > 0) return { lat: parseFloat(d[0].lat), lon: parseFloat(d[0].lon) };
    
    throw new Error("CEP não encontrado");
}

function renderizarResultados(latUser, lngUser) {
    const checkMesma = document.getElementById('checkMesma').checked;
    const container = document.getElementById('results-container');
    container.innerHTML = '';

    // 1. Filtrar e Calcular Distâncias para CADA filho
    let listaResultados = []; // Vai guardar { filho: obj, top3: [] }

    dadosFilhos.forEach(filho => {
        let candidatas = escolasDB.filter(e => {
            const tipoMatch = (filho.tipo === 'ambos') || (e.type === filho.tipo);
            // Verifica se o array levels inclui o nivel desejado
            const nivelMatch = e.levels.includes(filho.nivel);
            return tipoMatch && nivelMatch;
        });

        // Calcula distancia linear para ordenar inicialmente
        candidatas = candidatas.map(e => ({
            ...e, 
            distLinear: getDistancia(latUser, lngUser, e.lat, e.lng)
        }));
        
        candidatas.sort((a,b) => a.distLinear - b.distLinear);
        
        // Pega as Top 3
        listaResultados.push({
            filho: filho,
            ranking: candidatas.slice(0, 3) // Pega apenas as 3 primeiras
        });
    });

    // 2. Lógica de "Mesma Escola" (apenas se solicitado e possível)
    let escolaComum = null;
    let conflito = false;

    if (checkMesma && totalFilhos > 1) {
        // Pega os IDs das escolas do primeiro filho
        let idsComuns = listaResultados[0].ranking.map(e => e.id);
        
        // Faz a intersecção com os outros filhos
        for(let i=1; i<listaResultados.length; i++) {
            let idsOutro = listaResultados[i].ranking.map(e => e.id);
            idsComuns = idsComuns.filter(id => idsOutro.includes(id));
        }

        if(idsComuns.length > 0) {
            escolaComum = escolasDB.find(e => e.id === idsComuns[0]);
        } else {
            conflito = true;
        }
    }

    // 3. Renderização na Tela
    document.getElementById('result-screen').style.display = 'block';
    
    // Inicializa Mapa
    if(window.mapaInstancia) { window.mapaInstancia.remove(); } // Limpa mapa anterior se houver
    const mapa = L.map('mapa').setView([latUser, lngUser], 13);
    window.mapaInstancia = mapa; // Guarda referencia global
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapa);
    const layerGroup = L.layerGroup().addTo(mapa);
    L.marker([latUser, lngUser]).addTo(layerGroup).bindPopup("<b>Sua Casa</b>").openPopup();

    // Mensagens de Status Logístico
    if (conflito) {
        container.innerHTML += `<div style="padding:15px; background:#fff5f5; color:#c53030; border-radius:8px; margin-bottom:15px; text-align:center;">⚠️ Não foi possível encontrar uma única escola Top 3 compatível com todas as idades. Mostrando melhores opções individuais.</div>`;
    } else if (escolaComum) {
        container.innerHTML += `<div style="padding:15px; background:#f0fff4; color:#276749; border-radius:8px; margin-bottom:15px; text-align:center;">✅ <strong>Logística Perfeita:</strong> A escola <u>${escolaComum.nome}</u> atende a todos os filhos!</div>`;
    }

    // Loop por cada filho para gerar os cards
    listaResultados.forEach((item, indexFilho) => {
        let htmlFilho = `<div class="child-result">
                            <h3 style="margin:0 0 15px 0; color:#2d3748; border-bottom:2px solid #edf2f7; padding-bottom:10px;">
                                🧒 Criança ${item.filho.id} <small style="color:#718096; font-weight:normal;">(${item.filho.nivel})</small>
                            </h3>`;

        if(item.ranking.length === 0) {
            htmlFilho += `<p>Nenhuma escola encontrada com esses critérios.</p></div>`;
            container.innerHTML += htmlFilho;
            return;
        }

        // Se tiver escola comum forçada, sobrescrevemos a visualização para focar nela, 
        // mas vamos manter o ranking individual caso o usuário queira ver.
        // Vou renderizar o ranking normal de 3 escolas.

        item.ranking.forEach((escola, rankIndex) => {
            const isBest = rankIndex === 0;
            const badge = isBest ? "🏆 Melhor Opção" : (rankIndex === 1 ? "🥈 2ª Opção" : "🥉 3ª Opção");
            
            // IDs únicos para atualizar via AJAX depois
            const idCar = `car-${indexFilho}-${rankIndex}`;
            const idWalk = `walk-${indexFilho}-${rankIndex}`;
            const idDist = `dist-${indexFilho}-${rankIndex}`;

            // Se for escola comum, damos um destaque visual extra
            const isCommonHighlight = (escolaComum && escola.id === escolaComum.id);
            const extraStyle = isCommonHighlight ? "border: 2px solid #276749; background:#f0fff4;" : "";

            htmlFilho += `
                <div class="ranking-item rank-${rankIndex}" style="${extraStyle}">
                    <div class="badge-rank">${badge} ${isCommonHighlight ? "(Logística Unificada)" : ""}</div>
                    <div style="font-size:1.1rem; font-weight:bold; color:#2b6cb0;">${escola.nome}</div>
                    
                    <div class="school-address">
                        📍 ${escola.endereco || "Endereço não cadastrado"}
                    </div>

                    <div class="data-grid">
                        <div class="data-item">
                            <span class="data-label">Distância (Via Pública)</span>
                            <span class="data-value" id="${idDist}">calc...</span>
                        </div>
                        <div class="data-item">
                            <span class="data-label">Tempo Carro 🚗</span>
                            <span class="data-value" id="${idCar}">calc...</span>
                        </div>
                    </div>
                </div>
            `;

            // Adiciona marcador no mapa (apenas uma vez por escola para não duplicar)
            // Lógica simplificada: adiciona todos, o Leaflet lida bem.
            const marker = L.marker([escola.lat, escola.lng]).addTo(layerGroup);
            marker.bindPopup(`<b>${escola.nome}</b><br>${escola.endereco}`);

            // Traça rota APENAS para a 1ª opção de cada filho para não poluir o mapa
            if(isBest) {
                L.Routing.control({
                    waypoints: [L.latLng(latUser, lngUser), L.latLng(escola.lat, escola.lng)],
                    serviceUrl: 'https://router.project-osrm.org/route/v1',
                    lineOptions: { styles: [{color: getColor(indexFilho), opacity: 0.7, weight: 5}] },
                    createMarker: function() { return null; },
                    addWaypoints: false, draggableWaypoints: false, fitSelectedRoutes: false, show: false
                }).addTo(mapa);
            }

            // Busca dados reais de rota
            fetchDadosCompletos(latUser, lngUser, escola.lat, escola.lng, idCar, idWalk, idDist);
        });

        htmlFilho += `</div>`;
        container.innerHTML += htmlFilho;
    });
}

function fetchDadosCompletos(lat1, lng1, lat2, lng2, idCar, idWalk, idDist) {
    // ROTA DE CARRO
    fetch(`https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=false`)
        .then(r => r.json())
        .then(d => {
            if(d.routes && d.routes.length) {
                const distKm = (d.routes[0].distance / 1000).toFixed(1);
                const tempoCarroMin = Math.round(d.routes[0].duration / 60);
                
                const elDist = document.getElementById(idDist);
                const elCar = document.getElementById(idCar);
                
                if(elDist) elDist.innerText = distKm + " km";
                if(elCar) elCar.innerText = tempoCarroMin + " min";
            }
        })
        .catch(err => console.log("Erro rota", err));
}

function getDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const a = Math.sin((lat2-lat1)*Math.PI/360)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin((lon2-lon1)*Math.PI/360)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function getColor(i) {
    const colors = ['#3182ce', '#e53e3e', '#38a169', '#d69e2e', '#805ad5'];
    return colors[i % colors.length];
}
