
/* global Deck */

var prefix = Deck.prefix

var transform = prefix('transform')

var translate = Deck.translate

var $container = document.getElementById('container')
var $topbar = document.getElementById('topbar')

var $sort = document.createElement('button')
var $shuffle = document.createElement('button')
var $bysuit = document.createElement('button')
var $fan = document.createElement('button')
var $poker = document.createElement('button')
var $flip = document.createElement('button')
var $modeToggle = document.createElement('button')
var $fileInput = document.createElement('input')

$shuffle.textContent = 'Shuffle'
$sort.textContent = 'Sort'
$bysuit.textContent = 'By suit'
$fan.textContent = 'Fan'
$poker.textContent = 'Poker'
$flip.textContent = 'Flip'
$modeToggle.textContent = 'Mode: Original'
$modeToggle.title = 'Click to load a custom JSON deck'
$fileInput.type = 'file'
$fileInput.accept = 'application/json,.json'
$fileInput.classList.add('file-input')

$topbar.appendChild($flip)
$topbar.appendChild($shuffle)
$topbar.appendChild($bysuit)
$topbar.appendChild($fan)
$topbar.appendChild($poker)
$topbar.appendChild($sort)
$topbar.appendChild($modeToggle)
$topbar.appendChild($fileInput)
var deck
var deckMode = 'original'

// easter eggs start

function enableEasterEggs (deckInstance) {
  var acesClicked = []
  var kingsClicked = []

  deckInstance.cards.forEach(function (card, i) {
    card.enableDragging()
    card.enableFlipping()

    card.$el.addEventListener('mousedown', onTouch)
    card.$el.addEventListener('touchstart', onTouch)

    function onTouch () {
      var card

      if (i % 13 === 0) {
        acesClicked[i] = true
        if (acesClicked.filter(function (ace) {
          return ace
        }).length === 4) {
          document.body.removeChild($topbar)
          deckInstance.$el.style.display = 'none'
          setTimeout(function () {
            startWinning()
          }, 250)
        }
      } else if (i % 13 === 12) {
        if (!kingsClicked) {
          return
        }
        kingsClicked[i] = true
        if (kingsClicked.filter(function (king) {
          return king
        }).length === 4) {
          for (var j = 0; j < 3; j++) {
            card = Deck.Card(52 + j)
            card.mount(deckInstance.$el)
            card.$el.style[transform] = 'scale(0)'
            card.setSide('front')
            card.enableDragging()
            card.enableFlipping()
            deckInstance.cards.push(card)
          }
          deckInstance.sort(true)
          kingsClicked = false
        }
      } else {
        acesClicked = []
        if (kingsClicked) {
          kingsClicked = []
        }
      }
    }
  })
}

function startWinning () {
  var $winningDeck = document.createElement('div')
  $winningDeck.classList.add('deck')

  $winningDeck.style[transform] = translate(Math.random() * window.innerWidth - window.innerWidth / 2 + 'px', Math.random() * window.innerHeight - window.innerHeight / 2 + 'px')

  $container.appendChild($winningDeck)

  var side = Math.floor(Math.random() * 2) ? 'front' : 'back'

  for (var i = 0; i < 55; i++) {
    addWinningCard($winningDeck, i, side)
  }

  setTimeout(startWinning, Math.round(Math.random() * 1000))
}

function addWinningCard ($deck, i, side) {
  var card = Deck.Card(54 - i)
  var delay = (55 - i) * 20
  var animationFrames = Deck.animationFrames
  var ease = Deck.ease

  card.enableFlipping()

  if (side === 'front') {
    card.setSide('front')
  } else {
    card.setSide('back')
  }

  card.mount($deck)
  card.$el.style.display = 'none'

  var xStart = 0
  var yStart = 0
  var xDiff = -500
  var yDiff = 500

  animationFrames(delay, 1000)
    .start(function () {
      card.x = 0
      card.y = 0
      card.$el.style.display = ''
    })
    .progress(function (t) {
      var tx = t
      var ty = ease.cubicIn(t)
      card.x = xStart + xDiff * tx
      card.y = yStart + yDiff * ty
      card.$el.style[transform] = translate(card.x + 'px', card.y + 'px')
    })
    .end(function () {
      card.unmount()
    })
}

// easter eggs end

function setupDeck (options) {
  if (deck) {
    deck.unmount()
  }
  deck = Deck(options)
  enableEasterEggs(deck)
  deck.mount($container)
  deck.intro()
  deck.sort()
}

$shuffle.addEventListener('click', function () {
  deck.shuffle()
  deck.shuffle()
})
$sort.addEventListener('click', function () {
  deck.sort()
})
$bysuit.addEventListener('click', function () {
  deck.sort(true) // sort reversed
  deck.bysuit()
})
$fan.addEventListener('click', function () {
  deck.fan()
})
$flip.addEventListener('click', function () {
  deck.flip()
})
$poker.addEventListener('click', function () {
  deck.queue(function (next) {
    deck.cards.forEach(function (card, i) {
      setTimeout(function () {
        card.setSide('back')
      }, i * 7.5)
    })
    next()
  })
  deck.shuffle()
  deck.shuffle()
  deck.poker()
})

function useCustomMode (data) {
  deckMode = 'custom'
  $modeToggle.textContent = 'Mode: Custom'
  $modeToggle.title = 'Click to switch back to original deck'
  setupDeck({mode: 'custom', data: data})
}

function useOriginalMode () {
  deckMode = 'original'
  $modeToggle.textContent = 'Mode: Original'
  $modeToggle.title = 'Click to load a custom JSON deck'
  setupDeck()
}

$modeToggle.addEventListener('click', function () {
  if (deckMode === 'custom') {
    useOriginalMode()
    return
  }

  $fileInput.click()
})

$fileInput.addEventListener('change', function (event) {
  var file = event.target.files[0]

  if (!file) {
    return
  }

  var reader = new FileReader()

  reader.onload = function (loadEvent) {
    try {
      var parsed = JSON.parse(loadEvent.target.result)
      var data = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.data) ? parsed.data : null

      if (!data) {
        throw new Error('Invalid custom deck JSON')
      }

      if (data.length > 52) {
        window.alert('Custom deck limit exceeded. Please upload 52 cards or fewer.')
        return
      }

      useCustomMode(data)
    } catch (error) {
      window.alert('Invalid JSON. Please upload an array or { "data": [] }.')
    } finally {
      $fileInput.value = ''
    }
  }

  reader.onerror = function () {
    window.alert('Unable to read the JSON file.')
    $fileInput.value = ''
  }

  reader.readAsText(file)
})

useOriginalMode()

// secret message..

var randomDelay = 10000 + 30000 * Math.random()

setTimeout(function () {
  printMessage('Psst..I want to share a secret with you...')
}, randomDelay)

setTimeout(function () {
  printMessage('...try clicking all kings and nothing in between...')
}, randomDelay + 5000)

setTimeout(function () {
  printMessage('...have fun ;)')
}, randomDelay + 10000)

function printMessage (text) {
  var animationFrames = Deck.animationFrames
  var ease = Deck.ease
  var $message = document.createElement('p')
  $message.classList.add('message')
  $message.textContent = text

  document.body.appendChild($message)

  $message.style[transform] = translate(window.innerWidth + 'px', 0)

  var diffX = window.innerWidth

  animationFrames(1000, 700)
    .progress(function (t) {
      t = ease.cubicInOut(t)
      $message.style[transform] = translate((diffX - diffX * t) + 'px', 0)
    })

  animationFrames(6000, 700)
    .start(function () {
      diffX = window.innerWidth
    })
    .progress(function (t) {
      t = ease.cubicInOut(t)
      $message.style[transform] = translate((-diffX * t) + 'px', 0)
    })
    .end(function () {
      document.body.removeChild($message)
    })
}
