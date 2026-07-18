/**
 * Seletores do grafo de arquitetura. As vistas são *filtros* sobre uma fonte
 * única — nunca grafos paralelos, que divergiriam com o tempo.
 */

import { MACRO_EDGES, MACRO_NODES } from './macro'
import { TECNICA_EDGES, TECNICA_NODES } from './tecnica'
import type { ArqEdge, ArqNode, Estado, Vista } from './types'

export * from './types'

const TODOS_NODES: ArqNode[] = [...MACRO_NODES, ...TECNICA_NODES]
const TODAS_EDGES: ArqEdge[] = [...MACRO_EDGES, ...TECNICA_EDGES]

/** `ambos` casa com qualquer recorte; caso contrário exige igualdade. */
const visivelNoEstado = (estadoDoItem: Estado, recorte: Estado) =>
    estadoDoItem === 'ambos' || estadoDoItem === recorte

export const selecionarNodes = (vista: Vista, recorte: Estado): ArqNode[] =>
    TODOS_NODES.filter((n) => n.data.vista === vista && visivelNoEstado(n.data.estado, recorte))

/**
 * Filtra as arestas pela vista e pelo recorte, e descarta as que ficaram
 * penduradas — uma aresta cujo nó de origem ou destino sumiu no filtro faria o
 * ReactFlow renderizar uma linha para o nada.
 */
export const selecionarEdges = (vista: Vista, recorte: Estado): ArqEdge[] => {
    const idsVisiveis = new Set(selecionarNodes(vista, recorte).map((n) => n.id))

    return TODAS_EDGES.filter(
        (e) =>
            e.vista === vista &&
            visivelNoEstado(e.estado, recorte) &&
            idsVisiveis.has(e.source) &&
            idsVisiveis.has(e.target),
    )
}

export const buscarNode = (id: string): ArqNode | undefined =>
    TODOS_NODES.find((n) => n.id === id)
