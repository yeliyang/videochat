// Generate random room name if needed
if (!location.hash) {
    //location.hash = Math.floor(Math.random() * 0xFFFFFF).toString(16);
    rand = Math.floor(Math.random() * 0xFFFFFF).toString(16);
    name = prompt("Please Enter Name:", "anonymous" + rand);

    location.hash = name;
}
else {
    name = 'Customer Service';
}

console.log(name);

const roomHash = location.hash.substring(1);

const drone = new ScaleDrone('GZtLCKtcestPU9LF');
const roomName = 'observable-' + roomHash;
const configuration = {
    iceServers: [
        {urls: 'stun:stun.l.google.com:19302'}
    ]
};
let room;
let pc;
let dataChannel;


function onSuccess() {};
function onError(error) {
    console.error(error);
};

drone.on('open', error => {
    if (error) {
        return console.error(error);
    }
    room = drone.subscribe(roomName);
    room.on('open', error => {
        if (error) {
            onError(error);
        }
    });
    // We're connected to the chatRoom and received an array of 'members'
    // connected to the chatRoom (including us). Signaling server is ready.
    room.on('members', members => {
        console.log('MEMBERS', members);
        // If we are the second user to connect to the chatRoom we will be creating the offer
        const isOfferer = members.length === 2;
        startWebRTC(isOfferer);
    });
});

// Send signaling data via Scaledrone
function sendMessage(message) {
    drone.publish({
        room: roomName,
        message
    });
}

function startWebRTC(isOfferer) {
    console.log('Starting WebRTC in as', isOfferer ? 'offerer' : 'waiter');
    pc = new RTCPeerConnection(configuration);

    // 'onicecandidate' notifies us whenever an ICE agent needs to deliver a
    // message to the other peer through the signaling server
    pc.onicecandidate = event => {
        if (event.candidate) {
            sendMessage({'candidate': event.candidate});
        }
    };

    // If user is offerer let the 'negotiationneeded' event create the offer
    if (isOfferer) {
        pc.onnegotiationneeded = () => {
            pc.createOffer().then(localDescCreated).catch(onError);
            dataChannel = pc.createDataChannel('chat');
            setupDataChannel();
        }
    } else {
        // If user is not the offerer let wait for a data channel
        pc.ondatachannel = event => {
            dataChannel = event.channel;
            setupDataChannel();
        }
    }

    // When a remote stream arrives display it in the #remoteVideo element
    pc.ontrack = event => {
        remoteVideo.srcObject = event.stream;
    };

    navigator.getUserMedia = ( navigator.getUserMedia ||
        navigator.webkitGetUserMedia ||
        navigator.mozGetUserMedia ||
        navigator.msGetUserMedia);

    navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
    }).then(stream => {
        // Display your local video in #localVideo element
        localVideo.srcObject = stream;
        // Add your stream to be sent to the conneting peer
        pc.addStream(stream);
    }, onError);

    startListeningToSignals();
}

function startListeningToSignals(){
    // Listen to signaling data from Scaledrone
    room.on('data', (message, client) => {
        // Message was sent by us
        if (client.id === drone.clientId) {
            return;
        }

        if (message.sdp) {
            // This is called after receiving an offer or answer from another peer
            pc.setRemoteDescription(new RTCSessionDescription(message.sdp), () => {
                console.log('pc.remoteDescription.type', pc.remoteDescription.type);
                // When receiving an offer lets answer it
                if (pc.remoteDescription.type === 'offer') {
                    console.log('Answering offer');
                    pc.createAnswer().then(localDescCreated).catch(onError);
                }
            }, onError);
        } else if (message.candidate) {
            // Add the new ICE candidate to our connections remote description
            pc.addIceCandidate(
                new RTCIceCandidate(message.candidate), onSuccess, onError
            );
        }
    });
}

function localDescCreated(desc) {
    pc.setLocalDescription(
        desc,
        () => sendMessage({'sdp': pc.localDescription}),
        onError
    );
}

// chat

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
        //insertMessageToDOM({content: '\nYou can now text chat between the two tabs!'});
        //insertMessageToDOM({content: '\n-------------------------------------------'});
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

//insertMessageToDOM({content: 'Paste this URL into another tab / browser:\n' + location.href});