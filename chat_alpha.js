const name = prompt("Enter a username for this chat session:", "Anonymous");

// Generate random URL hash if we're initiating the chat:
if (!location.hash) { location.hash = Math.floor(Math.random() * 0xFFFFFF).toString(16); }
const chatHash = location.hash.substring(1);

// TODO: Write my own signaling code ----------------------------------------------------------------------------------
// Currently using ScaleDrone's free service for signaling:
const chatDrone = new ScaleDrone('VoeAP8nrTEcUK0I8');
// Scaledrone chatRoom name needs to be prefixed with 'observable-'
const chatRoomName = 'observable-' + chatHash + 'chat';
// Declare the Scaledrone chatRoom we'll use for signaling:
var chatRoom;

// Wait for Scaledrone signaling server to connect
chatDrone.on('open', error => {
    if (error) {
        return console.error(error);
    }
    chatRoom = chatDrone.subscribe(chatRoomName);
    chatRoom.on('open', error => {
        if (error) {
            return console.error(error);
        }
        console.log('Connected to signaling server');
    });
// We're connected to the chatRoom and received an array of 'members'
// connected to the chatRoom (including us). Signaling server is ready.
    chatRoom.on('members', members => {
        if (members.length >= 3) {
            return alert('The chatRoom is full');
        }
// If we are the second user to connect to the chatRoom we will be creating the offer
        const isOfferer = members.length === 2;
        startWebRTC(isOfferer);
    });
});

// Send signaling data via Scaledrone
function sendSignalingMessage(message) {
    chatDrone.publish({
        room: chatRoomName,
        message
    });
}
// -------------------------------------------------------------------------------------------------------------------

// We use Google's public STUN server to allow comunication outside of local network:
const configuration = { iceServers: [{url: 'stun:stun.l.google.com:19302'}] };
// Declare RTCPeerConnection & RTCDataChannel:
var chatPc, dataChannel;

// TODO: -------------------------------------------------------------------------------------------------------------

function startWebRTC(isOfferer) {
    console.log('Starting WebRTC in as', isOfferer ? 'offerer' : 'waiter');
    chatPc = new RTCPeerConnection(configuration);

    // 'onicecandidate' notifies us whenever an ICE agent needs to deliver a
    // message to the other peer through the signaling server
    chatPc.onicecandidate = event => {
        if (event.candidate) {
            sendSignalingMessage({'candidate': event.candidate});
        }
    };


    if (isOfferer) {
        // If user is offerer let them create a negotiation offer and set up the data channel
        chatPc.onnegotiationneeded = () => {
            chatPc.createOffer(localDescCreated, error => console.error(error));
        }
        dataChannel = chatPc.createDataChannel('chat');
        setupDataChannel();
    } else {
        // If user is not the offerer let wait for a data channel
        chatPc.ondatachannel = event => {
            dataChannel = event.channel;
            setupDataChannel();
        }
    }

    startListentingToSignals();
}

function startListentingToSignals() {
    // Listen to signaling data from Scaledrone
    chatRoom.on('data', (message, client) => {
        // Message was sent by us
        if (client.id === chatDrone.clientId) {
            return;
        }
        if (message.sdp) {
            // This is called after receiving an offer or answer from another peer
            chatPc.setRemoteDescription(new RTCSessionDescription(message.sdp), () => {
                console.log('chatPc.remoteDescription.type', chatPc.remoteDescription.type);
                // When receiving an offer lets answer it
                if (chatPc.remoteDescription.type === 'offer') {
                    console.log('Answering offer');
                    chatPc.createAnswer(localDescCreated, error => console.error(error));
                }
            }, error => console.error(error));
        } else if (message.candidate) {
            // Add the new ICE candidate to our connections remote description
            chatPc.addIceCandidate(new RTCIceCandidate(message.candidate));
        }
    });
}

function localDescCreated(desc) {
    chatPc.setLocalDescription(
        desc,
        () => sendSignalingMessage({'sdp': chatPc.localDescription}),
        error => console.error(error)
    );
}

// Hook up data channel event handlers
function setupDataChannel() {
    checkDataChannelState();
    dataChannel.onopen = checkDataChannelState;
    dataChannel.onclose = checkDataChannelState;
    dataChannel.onmessage = event =>
        insertMessageToDOM(JSON.parse(event.data), false)
}

function checkDataChannelState() {
    console.log('WebRTC channel state is:', dataChannel.readyState);
    if (dataChannel.readyState === 'open') {
        console.log('text channel open')
    }
}

function insertMessageToDOM(options, isFromMe) {
    const template = document.querySelector('template[data-template="message"]');
    const nameEl = template.content.querySelector('.message__name');
    if (options.name) {
        nameEl.innerText = '\n' + options.name + ' says:';
    }
    template.content.querySelector('.message__bubble').innerText = options.content;
    const clone = document.importNode(template.content, true);
    const messageEl = clone.querySelector('.message');
    if (isFromMe) {
        messageEl.classList.add('message--mine');
    } else {
        messageEl.classList.add('message--theirs');
    }

    const messagesEl = document.querySelector('.messages');
    messagesEl.appendChild(clone);

    // Scroll to bottom
    messagesEl.scrollTop = messagesEl.scrollHeight - messagesEl.clientHeight;
}

const form = document.querySelector('form');
form.addEventListener('submit', () => {
    const input = document.querySelector('input[type="text"]');
    const value = input.value;
    input.value = '';

    const data = {
        name,
        content: value,
    };

    dataChannel.send(JSON.stringify(data));

    insertMessageToDOM(data, true);
});