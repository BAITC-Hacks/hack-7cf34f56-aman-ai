По текущему design и ТЗ я бы сформулировал продукт как **MoneyGraph Investigator — рабочее место AML-аналитика**, а не просто визуализатор графа.

У нас получается следующий набор фич.

### Основные фичи

| Фича                          | Что делает                                                   | Статус       |
| ----------------------------- | ------------------------------------------------------------ | ------------ |
| **Transaction Graph**         | Строит направленный граф движения денег                      | Must-have    |
| **Role Detection**            | Определяет 6 функциональных ролей каждого из 2 248 узлов     | Must-have    |
| **Role Confidence**           | Показывает объяснимый `role_score`                           | Must-have    |
| **Seed Convergence**          | Находит точки, где сходятся цепочки от нескольких из 81 seed | Наше отличие |
| **Community Detection**       | Louvain разбивает сеть на связанные сообщества               | Must-have    |
| **Investigation Priority**    | Ранжирует узлы по `priority_score`                           | Must-have    |
| **Top Investigation Targets** | Показывает минимум 20 наиболее приоритетных GID              | Must-have    |
| **Evidence**                  | Объясняет, почему присвоены роль и приоритет                 | Must-have    |
| **Interactive Graph**         | Визуализирует направление денег, роли и кластеры             | Must-have    |
| **GID Search**                | Быстрый поиск любого клиента                                 | Must-have    |

И это непосредственно соответствует обязательным результатам ТЗ. 

## 1. Role Detection

Каждый узел получает одну основную роль:

```text
Consolidator
   ↓
собирает наблюдаемые потоки

Transit
   ↓
пропускает наблюдаемый поток дальше

Distributor
   ↓
распределяет на множество получателей

Terminal
   ↓
возможная конечная точка наблюдаемого потока

Coordinator
   ↓
структурно значимый / связывающий узел

Peripheral
   ↓
нет выраженных признаков остальных ролей
```

Причём внутри храним **все 6 scores**, поэтому в Node Card можем показать:

```text
PRIMARY ROLE

Consolidator       91% █████████
Coordinator        72% ███████
Transit            31% ███
Distributor        12% █
Terminal            4%
Peripheral          9%
```

Основной role — максимальный допустимый score. Это уже зафиксировано в design. 

---

## 2. Seed Convergence

Это я бы сделал одной из главных фич продукта.

```text
Seed 01 ─→ A ─┐
Seed 07 ─→ B ─┤
Seed 12 ──────┼──→ X
Seed 38 ─→ C ─┤
Seed 71 ──────┘
```

Система показывает:

**X reachable from 5 known seeds.**

Не просто:

> X имеет высокий PageRank.

А:

> В X сходятся наблюдаемые downstream-пути от пяти известных seed-клиентов.

В design для этого уже предусмотрена эффективная 81-bit mask реализация. 

---

## 3. Investigation Priority

Это отдельная фича от Role Detection.

Для каждого:

```text
Priority Score
0 ─────────────────────────── 1
                         ▲
                        .91
```

Он учитывает:

```text
Role importance/confidence
          +
Seed convergence
          +
Centrality / bridge
          +
Observed money volume
          +
Temporal patterns
          +
Network resilience
```

Формула уже формально определена в design. 

На frontend:

```text
INVESTIGATION PRIORITY

#   GID       ROLE             PRIORITY

1   938...    Consolidator       0.94
2   821...    Coordinator        0.91
3   713...    Transit            0.89
...
20  291...    Distributor        0.72
```

---

## 4. Node Investigation Card

При клике на GID:

```text
┌────────────────────────────────────┐
│ GID 100000003684369100             │
│                                    │
│ CONSOLIDATOR              91%      │
│ Investigation priority    87%      │
│ Cluster                   #4       │
├────────────────────────────────────┤
│ OBSERVED MONEY FLOW                │
│                                    │
│ Incoming       ₸8.4M               │
│ Outgoing       ₸350K               │
│ Senders        14                  │
│ Recipients      2                  │
├────────────────────────────────────┤
│ NETWORK                            │
│                                    │
│ Reachable seeds    6                 │
│ PageRank         top 3%            │
│ Betweenness      top 7%            │
├────────────────────────────────────┤
│ WHY?                               │
│                                    │
│ • High seed convergence            │
│ • 14 observed senders              │
│ • High structural importance       │
├────────────────────────────────────┤
│ LIMITATIONS                        │
│ Observed transactions only         │
├────────────────────────────────────┤
│ NEXT ACTION                        │
│ Inspect downstream transfers       │
└────────────────────────────────────┘
```

Именно такой payload уже заложен в design. 

---

## 5. Local Money Flow Graph

Не показываем 2 248 точек одновременно.

Выбираешь GID:

```text
             Seed 1
               ↓
       A ─────→ X
               ↑
       B ──────┤
               │
             TARGET
               │
          ┌────┴────┐
          ↓         ↓
          Y         Z
```

Можно переключать:

```text
1-hop
2-hop
Cluster
Seed paths
```

И цвета frontend уже может использовать для ролей/кластеров.

---

## 6. Community Explorer

Louvain даёт clusters.

Для каждого показываем:

```text
CLUSTER #4

Nodes                    186
Known seeds                7
Observed internal flow    ₸...

Top nodes
1. ...
2. ...
3. ...

Dominant signals
Consolidators: ...
Transit: ...
Distributors: ...

Hypothesis:
...
```

Важно: cluster не называем «преступной группой». Это только сообщество связанных транзакционных узлов.

---

## 7. Temporal Intelligence

Используем `transactions.parquet`.

Ищем:

```text
получил → отправил в тот же день

получил → отправил на следующий день

получил → отправил в течение 2 дней
```

Например:

```text
Observed incoming:
July 11

Observed outgoing:
July 11–12

→ timing-consistent turnover
```

Это помогает Transit.

Также:

**Daily burst**

```text
обычно:  2 tx/day
July 17: 21 tx

→ activity spike
```

И **Synchronized Incoming**:

```text
A ─┐
B ─┤
C ─┼→ X   July 17
D ─┤
E ─┘
```

ТЗ отдельно даёт баллы за такие временные паттерны. 

---

## 8. Observation Boundary Detection

Это хорошая фича именно под ваш dataset.

```text
Seed → depth1 → depth2 → depth3 → X
                                 depth4
                                   ↓
                              DATA ENDS
```

Вместо:

> Terminal

показываем:

```text
⚠ OBSERVATION BOUNDARY

Outgoing flow beyond this node
is not present in the dataset.

Terminal status cannot be
reliably determined.
```

И:

**Next action:** получить следующий уровень исходящих транзакций.

---

## 9. Network Resilience

Для важных узлов:

> Что случится с наблюдаемой сетью, если убрать этот узел?

```text
BEFORE

██████████████████

remove X

AFTER

██████    ███

    ███

██        ███
```

Показываем изменение:

```text
Largest component
Seed reachability
Number of fragments
```

Это optional из ТЗ. 

---

# А теперь AI-фичи

Здесь продукт становится намного интереснее.

## 10. AI Investigator — OpenAI

В интерфейсе:

```text
┌────────────────────────────────────┐
│ AI INVESTIGATOR                    │
│                                    │
│ Ask about the financial network... │
│                                    │
│ > Кто собирает потоки от seed      │
│   12, 91 и 173?                    │
└────────────────────────────────────┘
```

OpenAI сам выбирает tools:

```text
find_common_downstream()
        ↓
get_node()
        ↓
get_seed_paths()
        ↓
get_cluster()
```

И отвечает **только на основании backend facts**.

---

## 11. Natural Language → Graph Investigation

Можно задавать:

> Почему этот GID в Top-20?

> Какие seed приводят к этому узлу?

> Где сходятся seed 12, 17 и 82?

> Покажи путь между X и Y.

> Какие узлы связывают Cluster 3 и Cluster 7?

> Какие consolidator-кандидаты имеют наибольший priority?

Это фактически natural-language interface поверх вашего Graph Engine.

---

## 12. Compare Nodes

Очень хорошая demo-фича:

> Сравни GID X и GID Y.

Получаем:

```text
                 X             Y

Role         Consolidator   Coordinator
Priority        .91            .83
Seeds             9              3
PageRank        .82            .94
Betweenness     .91            .87
Volume          .77            .69
```

OpenAI объясняет:

> X имеет более высокий investigation priority главным образом из-за более выраженного seed convergence...

---

## 13. Explain This Node

Одна кнопка:

**Explain with AI**

Получаем нормальный AML-friendly текст из Node Card.

При этом обязательный `evidence` остаётся детерминированным; AI — расширенное объяснение.

---

## 14. Next Best Investigation Action

Мне эта фича особенно нравится.

```text
NODE
 ↓
known facts
 ↓
known limitations
 ↓
AI
 ↓
NEXT ACTION
```

Например:

> Для подтверждения гипотезы о транзитной роли стоит проверить дальнейшие исходящие операции узла и расширить окно наблюдения.

Или для `depth=4`:

> Для этого узла нельзя достоверно оценить terminal-role из текущей выгрузки. Следующий полезный запрос — дополнительное колено исходящих переводов.

---

## 15. NVIDIA Evidence Critic

Это уже дополнительная AI-фича.

```text
OpenAI investigation
        ↓
NVIDIA Critic
        ↓
"Подтверждается ли каждый вывод
фактическим evidence?"
        ↓
Final answer
```

Проверяет:

```text
unsupported claims
overconfident language
missing limitations
evidence mismatch
```

То есть:

**OpenAI = Investigator**

**NVIDIA = Evidence Guard**

**Python = Source of Truth**

---

# В итоге продукт имеет 3 уровня

```text
MONEYGRAPH INVESTIGATOR
│
├── 1. ANALYTICS
│   ├── Transaction Graph
│   ├── 6 Role Detection
│   ├── Seed Convergence ⭐
│   ├── Louvain Communities
│   ├── Priority Ranking
│   ├── Temporal Intelligence
│   ├── Boundary Detection
│   └── Network Resilience
│
├── 2. INVESTIGATION UI
│   ├── Top investigation targets
│   ├── GID Search
│   ├── Node Card
│   ├── Local Money Graph
│   ├── Cluster Explorer
│   ├── Evidence
│   └── Next Action
│
└── 3. AGENTIC AI
    ├── AI Investigator — OpenAI
    ├── Natural-language graph queries
    ├── Explain Node
    ├── Compare Nodes
    ├── Find Common Downstream
    ├── Investigation Recommendations
    └── Evidence Critic — NVIDIA
```

Если смотреть на **wow-фичи для 5-минутного demo**, я бы выделил четыре: **Seed Convergence**, **Explainable Role + Priority**, **AI Investigator с tool calling** и **Next Best Investigation Action**. Они лучше всего показывают, что у вас не просто `NetworkX + красивый граф`, а инструмент, который помогает AML-аналитику перейти от 81 известных нижнеуровневых клиентов к приоритетным точкам всей наблюдаемой сети.