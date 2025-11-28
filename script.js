// ======================================================
// 1. CARREGAMENTO DE DADOS
// ======================================================
let escolasDB = [];

// Carrega o arquivo JSON local
fetch('escolas.json')
    .then(response => response.json())
    .then(data => {
        escolasDB = data;
        console.log("Base de dados carregada:", escolasDB.length, "escolas.");
    })
    .catch(error => {
        console.error("Erro fatal: não foi possível carregar escolas.json", error);
        alert("Erro ao carregar a lista de escolas. Verifique se o arquivo escolas.json está na mesma pasta.");
    });


// ======================================================
// 2. CONTROLE DE NAVEGAÇÃO E ESTADO
// ======================================================
let totalFilhos = 1;
let filhoAtual = 1;
let dadosFilhos = [];
let configTemp = {};
let historyStack = ['q1']; 

// Função genérica para trocar de tela
function navigateTo(nextId) {
    const currentId = historyStack[historyStack.length - 1];
    const currentEl = document.getElementById(currentId);
    
    // Animação de saída
    currentEl.classList.remove('active');
    currentEl.classList.add('leaving');

    setTimeout(() => {
        currentEl.style.display = 'none';
        currentEl.classList.remove('leaving');
        
        const nextEl = document.getElementById(nextId);
        nextEl.style.display = 'block';
        
        // Atualiza labels de número do filho (ex: "Criança 2")
        if(nextId.startsWith('tpl-')) {
            document.querySelectorAll('.lbl-num').forEach(span => span.innerText = filhoAtual);
        }
        
        // Pequeno delay para a animação de entrada funcionar
        setTimeout(() => nextEl.classList.add('active'), 50);
    }, 400);

    historyStack.push(nextId);
}

// Função de voltar
function goBack() {
    if (historyStack.length <= 1) return;
    
    const currentId = historyStack.pop(); 
    const prevId = historyStack[historyStack.length - 1]; 

    // Lógica para decrementar o contador de filhos se estiver voltando steps
    if (currentId === 'tpl-tipo' && prevId === 'tpl-transporte') {
        filhoAtual--;
        dadosFilhos.pop(); 
    } else if (currentId === 'q-cep' && prevId === 'tpl-transporte') {
        // Se voltar do CEP para o transporte do último filho
        dadosFilhos.pop(); 
    }

    const currentEl = document.getElementById(currentId);
    const prevEl = document.getElementById(prevId);

    currentEl.classList.remove('active');
    currentEl.style.display = 'none';
    
    prevEl.style.display = 'block';
    
    if(prevId.startsWith('tpl-')) {
        document.querySelectorAll('.lbl-num').forEach(span => span.innerText = filhoAtual);
    }
    
    setTimeout(() => prevEl.classList.add('active'), 50);
}

// Inicia o fluxo a partir da Q1
function startFlow() {
    const inputQtd = document.getElementById('inputQtd');
    totalFilhos = parseInt(inputQtd.value);
    
    if (isNaN(totalFilhos) || totalFilhos < 1) totalFilhos = 1;
    if (totalFilhos > 5) totalFilhos = 5; // Limite de segurança

    filhoAtual = 1;
    dadosFilhos = [];
    navigateTo('tpl-tipo');
}

// Salva as escolhas temporárias (Tipo, Nível, Transporte)
function saveConfig(key, value) {
    configTemp[key] = value;
    
    if (key === 'tipo') {
        navigateTo('tpl-nivel');
    } else if (key === 'nivel') {
        navigateTo('tpl-transporte');
    } else if (key === 'transporte') {
        // Salva o objeto completo do filho
        configTemp.id = filhoAtual;
        dadosFilhos.push({...configTemp});
        configTemp = {}; // Limpa temp

        // Decide se vai pro próximo filho ou pro CEP
        if (filhoAtual < totalFilhos) {
            filhoAtual++;
            navigateTo('tpl-tipo');
        } else {
            // Se tiver mais de 1 filho, mostra opção de "Mesma Escola"
            const divMesma = document.getElementById('div-mesma-escola');
            if(totalFilhos > 1) {
                divMesma.style.display = 'block';
            } else {
                divMesma.style.display = 'none';
            }
            navigateTo('q-cep');
        }
    }
}


// ======================================================
// 3. LÓGICA DE GEOLOCALIZAÇÃO E RENDERIZAÇÃO
// ======================================================

// Botão "Ver Resultado" chama esta função
async function finalizar() {
    if (escolasDB.length === 0) {
        alert("A base de dados de escolas ainda não foi carregada. Tente novamente em alguns segundos.");
        return;
    }

    const inputCep = document.getElementById('inputCep');
    const cep = inputCep.value.replace(/\D/g, ''); // Remove tudo que não é número

    if (cep.length !== 8) { 
        alert('CEP inválido. Digite 8 números.'); 
        return; 
    }

    document.getElementById('loading-msg').style.display = 'block';

    try {
        const coords = await obterLatLon(cep);
        // Se deu certo, desenha a tela
        renderizarResultados(coords.lat, coords.lon);
    } catch (e) {
        console.error(e);
        alert("Não foi possível encontrar este CEP. Verifique a digitação ou tente um CEP próximo.");
    } finally {
        document.getElementById('loading-msg').style.display = 'none';
    }
}

// Função CORRIGIDA para buscar Lat/Lon
async function obterLatLon(cep) {
    console.log("Consultando CEP:", cep);

    // TENTATIVA 1: BrasilAPI (Geralmente mais rápido para BR)
    try {
        const r2 = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`);
        if (r2.ok) {
            const d2 = await r2.json();
            if(d2.location && d2.location.coordinates && d2.location.coordinates.latitude) {
                 return { 
                     lat: parseFloat(d2.location.coordinates.latitude), 
                     lon: parseFloat(d2.location.coordinates.longitude) 
                 };
            }
        }
    } catch(e) {
        console.warn("BrasilAPI falhou, tentando Nominatim...");
    }

    // TENTATIVA 2: OpenStreetMap (Nominatim) - Busca por Postal Code
    try {
        // Usando postalcode= garante busca exata de CEP
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&postalcode=${cep}&country=Brazil&limit=1`);
        if(r.ok) {
            const d = await r.json();
            if (d.length > 0) {
                return { lat: parseFloat(d[0].lat), lon: parseFloat(d[0].lon) };
            }
        }
    } catch(e) {
        console.error("Erro Nominatim:", e);
    }
    
    throw new Error("CEP não encontrado em nenhuma base.");
}

function renderizarResultados(latUser, lngUser) {
    const checkMesma = document.getElementById('checkMesma').checked;
    const container = document.getElementById('results-container');
    container.innerHTML = '';

    // --- Passo 1: Filtrar e Ordenar escolas para cada filho ---
    let listaResultados = []; 

    dadosFilhos.forEach(filho => {
        // Filtra por TIPO (Pública/Particular) e NÍVEL (Infantil/Fundamental...)
        let candidatas = escolasDB.filter(e => {
            const tipoMatch = (filho.tipo === 'ambos') || (e.type === filho.tipo);
            const nivelMatch = e.levels.includes(filho.nivel);
            return tipoMatch && nivelMatch;
        });

        // Adiciona distância linear para ordenação inicial rápida
        candidatas = candidatas.map(e => ({
            ...e, 
            distLinear: getDistancia(latUser, lngUser, e.lat, e.lng)
        }));
        
        // Ordena da mais perto para mais longe (em linha reta)
        candidatas.sort((a,b) => a.distLinear - b.distLinear);
        
        // Pega as Top 3
        listaResultados.push({
            filho: filho,
            ranking: candidatas.slice(0, 3) 
        });
    });

    // --- Passo 2: Verificar conflito ou escola comum ---
    let escolaComum = null;
    let conflito = false;

    if (checkMesma && totalFilhos > 1) {
        // Pega IDs da primeira criança
        let idsComuns = listaResultados[0].ranking.map(e => e.id);
        
        // Interseção com as outras crianças
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

    // --- Passo 3: Renderizar HTML ---
    document.getElementById('result-screen').style.display = 'block';
    
    // Inicializa Mapa (Leaflet)
    if(window.mapaInstancia) { 
        window.mapaInstancia.remove(); // Limpa mapa anterior para não dar erro
    }
    
    const mapa = L.map('mapa').setView([latUser, lngUser], 13);
    window.mapaInstancia = mapa; 
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(mapa);
    
    const layerGroup = L.layerGroup().addTo(mapa);
    
    // Marcador da Casa
    L.marker([latUser, lngUser]).addTo(layerGroup).bindPopup("<b>Sua Casa</b>").openPopup();

    // Avisos de Logística
    if (conflito) {
        container.innerHTML += `<div style="padding:15px; background:#fff5f5; color:#c53030; border:1px solid #feb2b2; border-radius:8px; margin-bottom:15px; text-align:center;">
            ⚠️ <strong>Atenção:</strong> Não encontramos uma única escola (entre as Top 3) que atenda todas as idades simultaneamente. Abaixo estão as melhores opções individuais.
        </div>`;
    } else if (escolaComum) {
        container.innerHTML += `<div style="padding:15px; background:#f0fff4; color:#276749; border:1px solid #9ae6b4; border-radius:8px; margin-bottom:15px; text-align:center;">
            ✅ <strong>Logística Otimizada!</strong> A escola <u>${escolaComum.nome}</u> atende a todos os seus filhos.
        </div>`;
    }

    // Loop para criar os cards
    listaResultados.forEach((item, indexFilho) => {
        let htmlFilho = `<div class="child-result">
                            <h3 style="margin:0 0 15px 0; color:#2d3748; border-bottom:2px solid #edf2f7; padding-bottom:10px;">
                                🧒 Criança ${item.filho.id} <small style="color:#718096; font-weight:normal;">(${capitalizar(item.filho.nivel)})</small>
                            </h3>`;

        if(item.ranking.length === 0) {
            htmlFilho += `<p style="color:red">Nenhuma escola encontrada com esses filtros na região.</p></div>`;
            container.innerHTML += htmlFilho;
            return;
        }

        item.ranking.forEach((escola, rankIndex) => {
            const isBest = (rankIndex === 0);
            
            // Labels
            let badgeText = "";
            let badgeClass = "";
            if (isBest) { badgeText = "🏆 Melhor Opção"; badgeClass = "badge-gold"; }
            else if (rankIndex === 1) { badgeText = "🥈 2ª Opção"; badgeClass = "badge-silver"; }
            else { badgeText = "🥉 3ª Opção"; badgeClass = "badge-bronze"; }

            // IDs únicos para injetar o cálculo de rota depois
            const idCar = `car-${indexFilho}-${rankIndex}`;
            const idDist = `dist-${indexFilho}-${rankIndex}`;

            // Destaque visual se for a escola comum
            const isCommonHighlight = (escolaComum && escola.id === escolaComum.id);
            const extraStyle = isCommonHighlight ? "border: 2px solid #38a169; background:#f0fff4;" : "";
            if (isCommonHighlight) badgeText += " (Recomendada)";

            htmlFilho += `
                <div class="ranking-item rank-${rankIndex}" style="${extraStyle}">
                    <div class="badge-rank ${badgeClass}">${badgeText}</div>
                    <div style="font-size:1.1rem; font-weight:bold; color:#2b6cb0; margin-top:5px;">${escola.nome}</div>
                    
                    <div class="school-address">
                        📍 ${escola.endereco || "Endereço não cadastrado"}
                    </div>

                    <div class="data-grid">
                        <div class="data-item">
                            <span class="data-label">Distância Real</span>
                            <span class="data-value" id="${idDist}">...</span>
                        </div>
                        <div class="data-item">
                            <span class="data-label">Tempo Carro 🚗</span>
                            <span class="data-value" id="${idCar}">...</span>
                        </div>
                    </div>
                </div>
            `;

            // Adiciona pin no mapa
            const marker = L.marker([escola.lat, escola.lng]).addTo(layerGroup);
            marker.bindPopup(`<b>${escola.nome}</b><br>${escola.endereco}`);

            // Traça rota no mapa APENAS para a 1ª opção de cada filho (para não poluir)
            if(isBest) {
                L.Routing.control({
                    waypoints: [L.latLng(latUser, lngUser), L.latLng(escola.lat, escola.lng)],
                    serviceUrl: 'https://router.project-osrm.org/route/v1',
                    lineOptions: { styles: [{color: getColor(indexFilho), opacity: 0.7, weight: 5}] },
                    createMarker: function() { return null; }, // Não cria marcadores extras do plugin
                    addWaypoints: false, 
                    draggableWaypoints: false, 
                    fitSelectedRoutes: false, 
                    show: false // Esconde painel de texto do mapa
                }).addTo(mapa);
            }

            // Dispara cálculo real de rota (OSRM)
            fetchDadosRota(latUser, lngUser, escola.lat, escola.lng, idCar, idDist);
        });

        htmlFilho += `</div>`;
        container.innerHTML += htmlFilho;
    });
}

// ======================================================
// 4. UTILITÁRIOS E CÁLCULOS
// ======================================================

// Busca dados precisos de rota (Distância via rua e tempo)
function fetchDadosRota(lat1, lng1, lat2, lng2, idTempo, idDist) {
    // API pública do OSRM (pode ter limitações de uso)
    fetch(`https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=false`)
        .then(r => r.json())
        .then(d => {
            if(d.routes && d.routes.length) {
                const distKm = (d.routes[0].distance / 1000).toFixed(1);
                const tempoCarroMin = Math.round(d.routes[0].duration / 60);
                
                const elDist = document.getElementById(idDist);
                const elTempo = document.getElementById(idTempo);
                
                if(elDist) elDist.innerText = distKm + " km";
                if(elTempo) elTempo.innerText = tempoCarroMin + " min";
            }
        })
        .catch(err => console.warn("Erro OSRM (possível limite de API):", err));
}

// Distância Haversine (Linha reta) - Usada apenas para ordenação inicial
function getDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371; // Raio da terra em km
    const dLat = (lat2-lat1) * Math.PI / 180;
    const dLon = (lon2-lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c; 
}

// Cores para as rotas no mapa
function getColor(i) {
    const colors = ['#3182ce', '#e53e3e', '#38a169', '#d69e2e', '#805ad5'];
    return colors[i % colors.length];
}

// Helper para texto
function capitalizar(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
